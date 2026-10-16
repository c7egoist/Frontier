// Triangle-only scene assembly for the Project-Drive ControlVehicle exhibit.
// Coordinates stay in the authored +X-forward, +Y-left, +Z-up convention.

export const VehicleConstants = Object.freeze({
  tyreRadius: 0.50855,
  rimRadius: 0.34460,
  authoredRimRadius: 0.344818,
  comHeight: 0.53,
  comAuthoredZ: 0.53 - (0.50855 - 0.0914),
  axleMounts: [
    [1.7274, 1.0475, 0.0914], [1.7274, -1.0475, 0.0914],
    [-1.6686, 1.0475, 0.0914], [-1.6686, -1.0475, 0.0914]
  ]
});

const PI = Math.PI;

export function loadFacetStream(buffer, label = 'facet') {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 48) throw new Error(`${label}: truncated FCT1 archive`);
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'FCT1') throw new Error(`${label}: expected FCT1, got ${magic}`);
  const vertexCount = view.getUint32(4, true);
  const facetCount = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  const positionOffset = 48;
  const facetOffset = positionOffset + vertexCount * 12;
  const familyOffset = facetOffset + facetCount * 12;
  const normalOffset = familyOffset + facetCount * 4;
  const expectedLength = normalOffset + ((flags & 1) ? facetCount * 36 : 0);
  if (expectedLength !== buffer.byteLength) throw new Error(`${label}: archive length/header mismatch`);
  return {
    vertexCount, facetCount, flags,
    positions: new Float32Array(buffer, positionOffset, vertexCount * 3),
    facets: new Uint32Array(buffer, facetOffset, facetCount * 3),
    families: new Uint32Array(buffer, familyOffset, facetCount),
    cornerNormals: (flags & 1) ? new Float32Array(buffer, normalOffset, facetCount * 9) : null
  };
}

export async function loadProjectDriveVehicle(onProgress = () => {}) {
  const files = [
    ['/assets/ControlVehicleBody.facet', 'body'],
    ['/assets/ControlVehicleTyre.facet', 'tyre'],
    ['/assets/ControlVehicleRim.facet', 'rim']
  ];
  const streams = {};
  for (let index = 0; index < files.length; index++) {
    const [path, name] = files[index];
    const response = await fetch(path, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
    streams[name] = loadFacetStream(await response.arrayBuffer(), name);
    onProgress((index + 1) / files.length, `Loaded ControlVehicle ${name} archive`);
  }
  return streams;
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(v) { const length = Math.hypot(v[0], v[1], v[2]); return length > 1e-12 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 1]; }
function clonePoint(p) { return [p[0], p[1], p[2]]; }

function triangle(a, b, c, material, normals = null) {
  const face = normalize(cross(sub(b, a), sub(c, a)));
  return { p: [clonePoint(a), clonePoint(b), clonePoint(c)], n: normals || [face, face, face], material };
}

function appendFacetMesh(stream, { zOffset = 0, scale = 1, mirrorY = false, swapWinding = false } = {}) {
  const triangles = [];
  for (let facet = 0; facet < stream.facetCount; facet++) {
    const points = [];
    const normals = [];
    for (let corner = 0; corner < 3; corner++) {
      const vertex = stream.facets[facet * 3 + corner];
      const offset = vertex * 3;
      const sign = mirrorY ? -1 : 1;
      points.push([
        stream.positions[offset] * scale,
        stream.positions[offset + 1] * scale * sign,
        stream.positions[offset + 2] * scale + zOffset
      ]);
      if (stream.cornerNormals) {
        const normalOffset = facet * 9 + corner * 3;
        normals.push(normalize([
          stream.cornerNormals[normalOffset],
          stream.cornerNormals[normalOffset + 1] * sign,
          stream.cornerNormals[normalOffset + 2]
        ]));
      }
    }
    if (swapWinding) {
      [points[1], points[2]] = [points[2], points[1]];
      if (normals.length) [normals[1], normals[2]] = [normals[2], normals[1]];
    }
    triangles.push(triangle(points[0], points[1], points[2], stream.families[facet], normals.length ? normals : null));
  }
  return triangles;
}

function appendQuad(target, a, b, c, d, material, flip = false) {
  if (flip) {
    target.push(triangle(a, c, b, material), triangle(a, d, c, material));
  } else {
    target.push(triangle(a, b, c, material), triangle(a, c, d, material));
  }
}

function addBox(target, center, size, material) {
  const [x, y, z] = center;
  const [sx, sy, sz] = size;
  const x0 = x - sx * 0.5, x1 = x + sx * 0.5;
  const y0 = y - sy * 0.5, y1 = y + sy * 0.5;
  const z0 = z, z1 = z + sz;
  // Every face is wound outwards; rays and the shading code are still two-sided-safe.
  appendQuad(target, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], material); // +Z
  appendQuad(target, [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], material); // -Z
  appendQuad(target, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], material); // +X
  appendQuad(target, [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], material); // -X
  appendQuad(target, [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], material); // +Y
  appendQuad(target, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], material); // -Y
}

function makeStudioEnvironment() {
  const triangles = [];
  const lights = [];
  const floorWidth = 40;
  const floorDepth = 28;
  const tileSize = 2;
  const cellsX = 20;
  const cellsY = 14;
  for (let x = 0; x < cellsX; x++) {
    for (let y = 0; y < cellsY; y++) {
      const x0 = -floorWidth * 0.5 + x * tileSize;
      const x1 = x0 + tileSize;
      const y0 = -floorDepth * 0.5 + y * tileSize;
      const y1 = y0 + tileSize;
      const material = ((x + y) & 1) ? 24 : 23;
      appendQuad(triangles, [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], material);
    }
  }

  // Larger open proving-ground: the coloured bounce cards frame a clear 28 × 17 m driving area.
  // Back red card: normal +X.
  appendQuad(triangles, [-18.0, -12.0, 0], [-18.0, 12.0, 0], [-18.0, 12.0, 6.0], [-18.0, -12.0, 6.0], 16);
  // Left green card: normal -Y.
  appendQuad(triangles, [-17.0, 12.0, 0], [17.0, 12.0, 0], [17.0, 12.0, 6.0], [-17.0, 12.0, 6.0], 17);
  // Far warm card at the end of the straight.
  appendQuad(triangles, [18.0, -12.0, 0], [18.0, 12.0, 0], [18.0, 12.0, 6.0], [18.0, -12.0, 6.0], 18);
  // Low cobalt reflector along the outer edge.
  appendQuad(triangles, [-12.0, -12.0, 0], [-12.0, -12.0, 4.6], [12.0, -12.0, 4.6], [12.0, -12.0, 0], 19);

  // Test blocks sit near the perimeter rather than beside the spawn, leaving the center lane open.
  addBox(triangles, [-12.6, 10.4, 0], [1.35, 1.1, 0.78], 21);
  addBox(triangles, [12.4, 10.4, 0], [1.0, 1.2, 1.15], 22);
  addBox(triangles, [12.5, -10.4, 0], [1.1, 1.0, 0.65], 19);

  const panelSpecs = [
    { center: [-7.0, -0.5, 8.0], u: [1.7, 0, 0], v: [0, 1.15, 0], radiance: [13.0, 12.2, 10.8] },
    { center: [0.0, 0.3, 8.0], u: [1.7, 0, 0], v: [0, 1.15, 0], radiance: [10.0, 12.0, 13.0] },
    { center: [7.0, -0.3, 8.0], u: [1.55, 0, 0], v: [0, 1.15, 0], radiance: [13.0, 8.0, 5.0] }
  ];
  for (const panel of panelSpecs) {
    const [cx, cy, cz] = panel.center;
    const [ux, uy] = panel.u;
    const [vx, vy] = panel.v;
    const a = [cx - ux - vx, cy - uy - vy, cz];
    const b = [cx + ux - vx, cy + uy - vy, cz];
    const c = [cx + ux + vx, cy + uy + vy, cz];
    const d = [cx - ux + vx, cy - uy + vy, cz];
    // The panels emit downwards; their FCT mesh is visible to camera and to indirect paths.
    appendQuad(triangles, a, d, c, b, 29);
    lights.push({ center: panel.center, u: panel.u, v: panel.v, radiance: panel.radiance });
  }
  return { triangles, lights };
}

export function makeMaterials() {
  const dielectric = (albedo, roughness, metalness = 0, emission = [0, 0, 0]) => ({ albedo, roughness, metalness, emission });
  const materials = [
    dielectric([0.22, 0.245, 0.27], 0.38), // 0 checker light
    dielectric([0.105, 0.125, 0.15], 0.42), // 1 checker dark
    dielectric([0.2, 0.23, 0.27], 0.55),
    dielectric([0.35, 0.38, 0.4], 0.4),
    dielectric([0.82, 0.62, 0.08], 0.42),
    dielectric([0.92, 0.22, 0.04], 0.38),
    dielectric([0.530404, 0.624357, 0.0], 0.0775, 0.08), // ControlVehicle body coat
    dielectric([0.027, 0.03, 0.034], 0.055, 0.12),
    dielectric([0.016, 0.018, 0.022], 0.5),
    dielectric([0.03741, 0.03741, 0.03741], 0.76087),
    dielectric([0.06, 0.22, 0.62], 0.22, 0.92, [0, 0.033, 0.12]),
    dielectric([0.30, 0.075, 0.025], 0.29, 0.82),
    dielectric([0.8, 0.8, 0.8], 0.5, 0.65),
    dielectric([0.8, 0.8, 0.8], 0.1, 0.0, [8.0, 8.0, 8.0]),
    dielectric([0.8, 0.8, 0.8], 0.1, 0.0, [2.2, 0.03, 0.02]),
    dielectric([0.8, 0.8, 0.8], 0.5),
    dielectric([0.72, 0.055, 0.07], 0.67),
    dielectric([0.055, 0.42, 0.18], 0.68),
    dielectric([0.56, 0.51, 0.40], 0.74),
    dielectric([0.055, 0.18, 0.62], 0.58),
    dielectric([0.38, 0.4, 0.40], 0.82),
    dielectric([0.62, 0.34, 0.09], 0.58),
    dielectric([0.23, 0.29, 0.34], 0.46),
    dielectric([0.15, 0.17, 0.19], 0.62), // 23 checker light studio floor
    dielectric([0.105, 0.12, 0.14], 0.68), // 24 checker dark studio floor
    dielectric([0.9, 0.88, 0.78], 0.2, 0, [10.0, 9.7, 8.6]) // 25? reserved, kept for stable family extension
  ];
  // The lamp panels use family 29. Fill the family table through 29 without changing the archived family IDs.
  while (materials.length < 29) materials.push(dielectric([0.5, 0.5, 0.5], 0.7));
  materials[29] = dielectric([0.9, 0.88, 0.78], 0.2, 0, [10.0, 9.7, 8.6]);
  return materials;
}

function axisAngle(axis, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}
function multiplyQuaternion(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
function composeRigid(position, quaternion) {
  const [x, y, z, w] = quaternion;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    position[0], position[1], position[2], 1
  ]);
}
function inverseRigid(matrix) {
  const m = matrix;
  const tx = m[12], ty = m[13], tz = m[14];
  return new Float32Array([
    m[0], m[4], m[8], 0,
    m[1], m[5], m[9], 0,
    m[2], m[6], m[10], 0,
    -(m[0] * tx + m[1] * ty + m[2] * tz),
    -(m[4] * tx + m[5] * ty + m[6] * tz),
    -(m[8] * tx + m[9] * ty + m[10] * tz), 1
  ]);
}
function rotateZ(point, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [point[0] * c - point[1] * s, point[0] * s + point[1] * c, point[2]];
}

export function createVehicleState() {
  return { x: 0, y: 0, yaw: 0, speed: 0, steering: 0, wheelSpin: 0, isMoving: false };
}

export function stepVehicle(state, input, deltaSeconds) {
  const dt = Math.min(Math.max(deltaSeconds, 0), 1 / 20);
  const wantsForward = Boolean(input.forward && !input.reverse);
  const wantsReverse = Boolean(input.reverse && !input.forward);
  const isBrakingAgainstTravel = (wantsForward && state.speed < -0.15) || (wantsReverse && state.speed > 0.15);
  const brakeRate = input.handbrake ? 13.0 : (isBrakingAgainstTravel ? 8.5 : 0.0);
  if (brakeRate > 0.0) {
    const speedChange = brakeRate * dt;
    state.speed = Math.abs(state.speed) <= speedChange ? 0.0 : state.speed - Math.sign(state.speed) * speedChange;
  } else if (wantsForward) {
    state.speed = Math.min(14.0, state.speed + 5.5 * dt);
  } else if (wantsReverse) {
    state.speed = Math.max(-5.0, state.speed - 4.0 * dt);
  } else {
    const drag = 1.35 * dt;
    state.speed = Math.abs(state.speed) <= drag ? 0.0 : state.speed - Math.sign(state.speed) * drag;
  }

  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  state.steering += (steerInput * 0.62 - state.steering) * Math.min(1, dt * 7.0);
  state.yaw += state.steering * state.speed * 0.24 * dt;
  state.x += Math.cos(state.yaw) * state.speed * dt;
  state.y += Math.sin(state.yaw) * state.speed * dt;

  // Per-axis soft bounds retain room for turns, and only cancel velocity aimed farther into a wall.
  const forwardX = Math.cos(state.yaw) * state.speed;
  const forwardY = Math.sin(state.yaw) * state.speed;
  const xLimit = 14.0;
  const yLimit = 8.5;
  if (state.x > xLimit) { state.x = xLimit; if (forwardX > 0) state.speed = 0; }
  if (state.x < -xLimit) { state.x = -xLimit; if (forwardX < 0) state.speed = 0; }
  if (state.y > yLimit) { state.y = yLimit; if (forwardY > 0) state.speed = 0; }
  if (state.y < -yLimit) { state.y = -yLimit; if (forwardY < 0) state.speed = 0; }
  state.wheelSpin += state.speed * dt / VehicleConstants.tyreRadius;
  state.isMoving = Math.abs(state.speed) > 0.035;
  return state;
}

function buildObjectTransforms(vehicle) {
  const yaw = axisAngle([0, 0, 1], vehicle.yaw);
  const bodyPosition = [vehicle.x, vehicle.y, VehicleConstants.comHeight];
  const transforms = [composeRigid(bodyPosition, yaw)];
  for (let wheel = 0; wheel < 4; wheel++) {
    const mount = VehicleConstants.axleMounts[wheel];
    const local = [mount[0], mount[1], mount[2] - VehicleConstants.comAuthoredZ];
    const rotated = rotateZ(local, vehicle.yaw);
    const position = [vehicle.x + rotated[0], vehicle.y + rotated[1], bodyPosition[2] + rotated[2]];
    const steer = wheel < 2 ? vehicle.steering : 0;
    const spinSign = (wheel & 1) ? -1 : 1;
    const orientation = multiplyQuaternion(multiplyQuaternion(yaw, axisAngle([0, 0, 1], steer)),
                                           axisAngle([0, 1, 0], vehicle.wheelSpin * spinSign));
    transforms.push(composeRigid(position, orientation));
  }
  transforms.push(composeRigid([0, 0, 0], [0, 0, 0, 1])); // static studio triangles
  return transforms;
}

// Build a median-split object-space BVH. It is intentionally an ordinary triangle BVH:
// no signed-distance fields, voxel volumes or sphere tracing are involved.
function buildMeshBvh(mesh) {
  const nodes = [];
  const orderedTriangles = [];
  const triangleCount = mesh.triangles.length;
  const indices = Array.from({ length: triangleCount }, (_, index) => index);
  const boundsFor = (triangleIndex) => {
    const tri = mesh.triangles[triangleIndex];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const point of tri.p) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    return { min, max };
  };
  const centers = mesh.triangles.map((tri) => [
    (tri.p[0][0] + tri.p[1][0] + tri.p[2][0]) / 3,
    (tri.p[0][1] + tri.p[1][1] + tri.p[2][1]) / 3,
    (tri.p[0][2] + tri.p[1][2] + tri.p[2][2]) / 3
  ]);

  const build = (start, end) => {
    const nodeIndex = nodes.length;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const centerMin = [Infinity, Infinity, Infinity];
    const centerMax = [-Infinity, -Infinity, -Infinity];
    for (let cursor = start; cursor < end; cursor++) {
      const bounds = boundsFor(indices[cursor]);
      const center = centers[indices[cursor]];
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], bounds.min[axis]);
        max[axis] = Math.max(max[axis], bounds.max[axis]);
        centerMin[axis] = Math.min(centerMin[axis], center[axis]);
        centerMax[axis] = Math.max(centerMax[axis], center[axis]);
      }
    }
    const node = { min, max, left: 0, right: 0, first: 0, count: 0 };
    nodes.push(node);
    const count = end - start;
    if (count <= 6) {
      node.first = orderedTriangles.length;
      node.count = count;
      for (let cursor = start; cursor < end; cursor++) orderedTriangles.push(indices[cursor]);
      return nodeIndex;
    }
    let axis = 0;
    if (centerMax[1] - centerMin[1] > centerMax[axis] - centerMin[axis]) axis = 1;
    if (centerMax[2] - centerMin[2] > centerMax[axis] - centerMin[axis]) axis = 2;
    const sorted = indices.slice(start, end).sort((a, b) => centers[a][axis] - centers[b][axis]);
    for (let offset = 0; offset < sorted.length; offset++) indices[start + offset] = sorted[offset];
    const middle = start + (count >> 1);
    node.left = build(start, middle);
    node.right = build(middle, end);
    return nodeIndex;
  };

  const root = build(0, triangleCount);
  return { ...mesh, nodes, orderedTriangles, root };
}

function createVehicleMeshes(streams, studioTriangles) {
  const body = appendFacetMesh(streams.body, { zOffset: -VehicleConstants.comAuthoredZ });
  const tyre = appendFacetMesh(streams.tyre);
  const rim = appendFacetMesh(streams.rim, { scale: VehicleConstants.rimRadius / VehicleConstants.authoredRimRadius });
  const wheelLeft = tyre.concat(rim);
  const wheelRight = [
    ...appendFacetMesh(streams.tyre, { mirrorY: true, swapWinding: true }),
    ...appendFacetMesh(streams.rim, { scale: VehicleConstants.rimRadius / VehicleConstants.authoredRimRadius, mirrorY: true, swapWinding: true })
  ];
  return [
    { name: 'ControlVehicle body', triangles: body },
    { name: 'ControlVehicle wheel left', triangles: wheelLeft },
    { name: 'ControlVehicle wheel right', triangles: wheelRight },
    { name: 'Studio + bounce cards', triangles: studioTriangles }
  ];
}

function packGeometry(meshes, materials, lights, transforms) {
  const builtMeshes = meshes.map(buildMeshBvh);
  let totalTriangles = 0;
  let totalNodes = 0;
  let totalIndices = 0;
  for (const mesh of builtMeshes) {
    mesh.triangleOffset = totalTriangles;
    mesh.nodeOffset = totalNodes;
    mesh.indexOffset = totalIndices;
    mesh.packedRoot = totalNodes + mesh.root;
    totalTriangles += mesh.triangles.length;
    totalNodes += mesh.nodes.length;
    totalIndices += mesh.orderedTriangles.length;
  }

  const triangleWords = 28;
  const triangleData = new ArrayBuffer(totalTriangles * triangleWords * 4);
  const triangleFloats = new Float32Array(triangleData);
  const triangleUints = new Uint32Array(triangleData);
  let triangleCursor = 0;
  for (const mesh of builtMeshes) {
    for (const tri of mesh.triangles) {
      const base = triangleCursor * triangleWords;
      for (let corner = 0; corner < 3; corner++) {
        const pOffset = base + corner * 4;
        const nOffset = base + 12 + corner * 4;
        triangleFloats[pOffset] = tri.p[corner][0];
        triangleFloats[pOffset + 1] = tri.p[corner][1];
        triangleFloats[pOffset + 2] = tri.p[corner][2];
        triangleFloats[nOffset] = tri.n[corner][0];
        triangleFloats[nOffset + 1] = tri.n[corner][1];
        triangleFloats[nOffset + 2] = tri.n[corner][2];
      }
      triangleUints[base + 24] = tri.material >>> 0;
      triangleCursor++;
    }
  }

  const nodeWords = 12;
  const objectWords = 52;
  const materialWords = 16;
  const lightWords = 16;
  const nodeOffset = 0;
  const indexOffset = totalNodes * nodeWords;
  const meshOffset = indexOffset + totalIndices;
  const objectOffset = meshOffset + builtMeshes.length * 4;
  const materialOffset = objectOffset + transforms.length * objectWords;
  const lightOffset = materialOffset + materials.length * materialWords;
  const totalSceneWords = lightOffset + lights.length * lightWords;
  const sceneData = new ArrayBuffer(totalSceneWords * 4);
  const sceneUints = new Uint32Array(sceneData);
  const sceneFloats = new Float32Array(sceneData);

  for (const mesh of builtMeshes) {
    for (let localIndex = 0; localIndex < mesh.nodes.length; localIndex++) {
      const node = mesh.nodes[localIndex];
      const base = nodeOffset + (mesh.nodeOffset + localIndex) * nodeWords;
      sceneFloats[base] = node.min[0]; sceneFloats[base + 1] = node.min[1]; sceneFloats[base + 2] = node.min[2];
      sceneFloats[base + 4] = node.max[0]; sceneFloats[base + 5] = node.max[1]; sceneFloats[base + 6] = node.max[2];
      if (node.count) {
        sceneUints[base + 8] = mesh.indexOffset + node.first;
        sceneUints[base + 9] = node.count;
      } else {
        sceneUints[base + 8] = mesh.nodeOffset + node.left;
        sceneUints[base + 10] = mesh.nodeOffset + node.right;
      }
    }
    for (let ordered = 0; ordered < mesh.orderedTriangles.length; ordered++) {
      sceneUints[indexOffset + mesh.indexOffset + ordered] = mesh.triangleOffset + mesh.orderedTriangles[ordered];
    }
  }
  for (let meshIndex = 0; meshIndex < builtMeshes.length; meshIndex++) {
    const base = meshOffset + meshIndex * 4;
    sceneUints[base] = builtMeshes[meshIndex].packedRoot;
    sceneUints[base + 1] = builtMeshes[meshIndex].triangleOffset;
    sceneUints[base + 2] = builtMeshes[meshIndex].triangles.length;
  }
  for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
    const material = materials[materialIndex];
    const base = materialOffset + materialIndex * materialWords;
    sceneFloats.set([material.albedo[0], material.albedo[1], material.albedo[2], material.roughness,
                     material.emission[0], material.emission[1], material.emission[2], material.metalness,
                     0.04, 0, 0, 0, 0, 0, 0, 0], base);
  }
  for (let lightIndex = 0; lightIndex < lights.length; lightIndex++) {
    const light = lights[lightIndex];
    const base = lightOffset + lightIndex * lightWords;
    sceneFloats.set([light.center[0], light.center[1], light.center[2], 0,
                     light.u[0], light.u[1], light.u[2] || 0, 0,
                     light.v[0], light.v[1], light.v[2] || 0, 0,
                     light.radiance[0], light.radiance[1], light.radiance[2], 0], base);
  }

  const initialTransforms = transforms.map((matrix) => new Float32Array(matrix));
  for (let objectIndex = 0; objectIndex < initialTransforms.length; objectIndex++) {
    const meshIndex = objectIndex < 1 ? 0 : (objectIndex < 2 ? 1 : (objectIndex < 3 ? 2 : (objectIndex < 5 ? (objectIndex & 1 ? 1 : 2) : 3)));
    writeObjectRecord(sceneFloats, sceneUints, objectOffset + objectIndex * objectWords,
                      initialTransforms[objectIndex], initialTransforms[objectIndex], meshIndex, objectIndex);
  }

  return {
    triangleData, sceneData, builtMeshes, totalTriangles, totalNodes, totalIndices,
    offsets: { nodeOffset, indexOffset, meshOffset, objectOffset, materialOffset, lightOffset },
    objectWords, materials, lights, lastTransforms: initialTransforms
  };
}

function writeObjectRecord(floatView, uintView, base, model, previousModel, meshIndex, objectId) {
  const inverse = inverseRigid(model);
  floatView.set(model, base);
  floatView.set(inverse, base + 16);
  floatView.set(previousModel, base + 32);
  uintView[base + 48] = meshIndex;
  uintView[base + 49] = objectId;
  uintView[base + 50] = 0;
  uintView[base + 51] = 0;
}

function makeInitialTransforms(vehicle) {
  return buildObjectTransforms(vehicle);
}

export async function buildRealtimeScene(onProgress = () => {}) {
  const streams = await loadProjectDriveVehicle(onProgress);
  onProgress(0.58, 'Assembling studio triangles and light cards');
  const vehicle = createVehicleState();
  const studio = makeStudioEnvironment();
  const meshes = createVehicleMeshes(streams, studio.triangles);
  const materials = makeMaterials();
  const packageData = packGeometry(meshes, materials, studio.lights, makeInitialTransforms(vehicle));
  onProgress(1, 'Building per-mesh triangle BVHs');
  return new RealtimeScene(packageData, vehicle);
}

export class RealtimeScene {
  constructor(packageData, vehicle) {
    Object.assign(this, packageData);
    this.vehicle = vehicle;
    this.totalTriangles = packageData.totalTriangles;
    this.objectCount = 6;
    this.historyValid = false;
    this.driving = false;
  }

  get currentSpeedKmh() { return Math.round(Math.abs(this.vehicle.speed) * 3.6); }

  resetVehicle() {
    const reset = createVehicleState();
    Object.assign(this.vehicle, reset);
    this.driving = false;
    this.updateObjectRecords(null);
  }

  advanceVehicle(input, dt) {
    const moving = input.forward || input.reverse || input.left || input.right || input.handbrake;
    this.driving = Boolean(moving || Math.abs(this.vehicle.speed) > 0.035);
    stepVehicle(this.vehicle, input, dt);
  }

  updateObjectRecords(previousTransforms = null) {
    const nextTransforms = buildObjectTransforms(this.vehicle);
    const previous = previousTransforms || this.lastTransforms;
    const sceneFloats = new Float32Array(this.sceneData);
    const sceneUints = new Uint32Array(this.sceneData);
    const base = this.offsets.objectOffset;
    const records = new ArrayBuffer(this.objectCount * this.objectWords * 4);
    const recordFloats = new Float32Array(records);
    const recordUints = new Uint32Array(records);
    for (let objectIndex = 0; objectIndex < this.objectCount; objectIndex++) {
      const meshIndex = objectIndex < 1 ? 0 : (objectIndex < 2 ? 1 : (objectIndex < 3 ? 2 : (objectIndex < 5 ? (objectIndex & 1 ? 1 : 2) : 3)));
      const objectBase = base + objectIndex * this.objectWords;
      writeObjectRecord(sceneFloats, sceneUints, objectBase, nextTransforms[objectIndex], previous[objectIndex], meshIndex, objectIndex);
      const recordBase = objectIndex * this.objectWords;
      recordFloats.set(sceneFloats.subarray(objectBase, objectBase + this.objectWords), recordBase);
      // floatView copies integer metadata as float bits; restore the four metadata words exactly after the copy.
      recordUints[recordBase + 48] = sceneUints[objectBase + 48];
      recordUints[recordBase + 49] = sceneUints[objectBase + 49];
      recordUints[recordBase + 50] = sceneUints[objectBase + 50];
      recordUints[recordBase + 51] = sceneUints[objectBase + 51];
    }
    this.lastTransforms = nextTransforms.map((matrix) => new Float32Array(matrix));
    return { records, byteOffset: base * 4, matrices: nextTransforms };
  }
}

export function getCameraBasis(camera) {
  const position = camera.position;
  const target = camera.target;
  const forward = normalize(sub(target, position));
  let right = normalize(cross(forward, [0, 0, 1]));
  if (Math.hypot(...right) < 1e-5) right = [1, 0, 0];
  const up = normalize(cross(right, forward));
  return { position: clonePoint(position), forward, right, up };
}

export function cameraFromOrbit(orbit, target = null) {
  const focus = target || orbit.target;
  const cp = Math.cos(orbit.pitch);
  const position = [
    focus[0] + Math.cos(orbit.yaw) * cp * orbit.distance,
    focus[1] + Math.sin(orbit.yaw) * cp * orbit.distance,
    focus[2] + Math.sin(orbit.pitch) * orbit.distance
  ];
  return { position, target: clonePoint(focus), fovY: orbit.fovY || (43 * PI / 180) };
}

export function makeLookAtMatrix(camera) {
  const { position, target, fovY } = camera;
  const basis = getCameraBasis(camera);
  const aspect = camera.aspect || 1;
  const f = 1 / Math.tan(fovY * 0.5);
  const near = 0.1, far = 120;
  const projection = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0
  ]);
  const r = basis.right, u = basis.up, z = [-basis.forward[0], -basis.forward[1], -basis.forward[2]];
  const view = new Float32Array([
    r[0], u[0], z[0], 0,
    r[1], u[1], z[1], 0,
    r[2], u[2], z[2], 0,
    -dot(r, position), -dot(u, position), -dot(z, position), 1
  ]);
  return multiplyMat4(projection, view);
}

function multiplyMat4(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1]
                          + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

export function getMeshWorldTriangles(scene, includeEnvironment = true) {
  const output = [];
  const transforms = buildObjectTransforms(scene.vehicle);
  for (let objectIndex = 0; objectIndex < scene.objectCount; objectIndex++) {
    if (!includeEnvironment && objectIndex === 5) continue;
    const meshIndex = objectIndex < 1 ? 0 : (objectIndex < 2 ? 1 : (objectIndex < 3 ? 2 : (objectIndex < 5 ? (objectIndex & 1 ? 1 : 2) : 3)));
    const matrix = transforms[objectIndex];
    const mesh = scene.builtMeshes[meshIndex];
    for (const tri of mesh.triangles) {
      const vertices = tri.p.map((p) => [
        matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12],
        matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13],
        matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14]
      ]);
      const normals = tri.n.map((n) => normalize([
        matrix[0] * n[0] + matrix[4] * n[1] + matrix[8] * n[2],
        matrix[1] * n[0] + matrix[5] * n[1] + matrix[9] * n[2],
        matrix[2] * n[0] + matrix[6] * n[1] + matrix[10] * n[2]
      ]));
      output.push({ p: vertices, n: normals, material: tri.material });
    }
  }
  return output;
}
