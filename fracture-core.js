const EPSILON = 1e-8;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function multiply(a, scalar) { return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }; }
function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function magnitude(a) { return Math.hypot(a.x, a.y, a.z); }
function normalize(a) {
  const length = magnitude(a);
  return length < EPSILON ? { x: 0, y: 1, z: 0 } : multiply(a, 1 / length);
}
function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
function average(points) {
  const sum = points.reduce((result, point) => add(result, point), { x: 0, y: 0, z: 0 });
  return multiply(sum, 1 / Math.max(1, points.length));
}

function pointKey(point, precision = 1e-6) {
  return `${Math.round(point.x / precision)},${Math.round(point.y / precision)},${Math.round(point.z / precision)}`;
}

function uniquePoints(points, toleranceSquared = 1e-12) {
  const unique = [];
  for (const point of points) {
    if (!unique.some((candidate) => distanceSquared(candidate, point) <= toleranceSquared)) unique.push(point);
  }
  return unique;
}

function cleanFace(points) {
  const cleaned = [];
  for (const point of points) {
    if (!cleaned.length || distanceSquared(cleaned[cleaned.length - 1], point) > 1e-12) cleaned.push(point);
  }
  if (cleaned.length > 1 && distanceSquared(cleaned[0], cleaned[cleaned.length - 1]) <= 1e-12) cleaned.pop();
  return cleaned;
}

function makeTriangleFace(indices, points, interior) {
  const a = points[indices[0]];
  const b = points[indices[1]];
  const c = points[indices[2]];
  let normal = cross(subtract(b, a), subtract(c, a));
  const len = magnitude(normal);
  if (len < 1e-9) return null;
  normal = multiply(normal, 1 / len);
  let ordered = indices.slice();
  if (dot(normal, subtract(interior, a)) > 0) {
    ordered = [indices[0], indices[2], indices[1]];
    normal = multiply(normal, -1);
  }
  return { indices: ordered, normal };
}

/**
 * Beneath-Beyond topological 3D convex hull.
 * Guarantees a closed, outward-oriented, 2-manifold triangle mesh where every edge is shared by 2 faces.
 */
function convexHullFaces(rawPoints) {
  const points = rawPoints.map((point, index) => ({
    x: point.x + Math.sin(index * 12.9898 + 0.73) * 1e-5,
    y: point.y + Math.cos(index * 78.233 + 1.91) * 1e-5,
    z: point.z + Math.sin(index * 37.719 + 3.17) * 1e-5,
  }));

  if (points.length < 4) throw new Error('Could not construct a closed 3D rock hull from fewer than 4 points.');

  // Pick initial non-degenerate tetrahedron [i0, i1, i2, i3]
  let i0 = 0;
  let i1 = 1;
  let maxDistSq = -1;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = distanceSquared(points[i], points[j]);
      if (d > maxDistSq) {
        maxDistSq = d;
        i0 = i;
        i1 = j;
      }
    }
  }

  let i2 = -1;
  let maxAreaSq = -1;
  const lineDir = subtract(points[i1], points[i0]);
  for (let i = 0; i < points.length; i += 1) {
    if (i === i0 || i === i1) continue;
    const areaVec = cross(lineDir, subtract(points[i], points[i0]));
    const areaSq = dot(areaVec, areaVec);
    if (areaSq > maxAreaSq) {
      maxAreaSq = areaSq;
      i2 = i;
    }
  }

  let i3 = -1;
  let maxVol = -1;
  const baseNormal = normalize(cross(subtract(points[i1], points[i0]), subtract(points[i2], points[i0])));
  for (let i = 0; i < points.length; i += 1) {
    if (i === i0 || i === i1 || i === i2) continue;
    const vol = Math.abs(dot(baseNormal, subtract(points[i], points[i0])));
    if (vol > maxVol) {
      maxVol = vol;
      i3 = i;
    }
  }

  if (i2 < 0 || i3 < 0 || maxVol < 1e-7) {
    throw new Error('Could not construct a closed 3D rock hull from degenerate points.');
  }

  const initialIndices = [i0, i1, i2, i3];
  const interior = average(initialIndices.map((idx) => points[idx]));
  let faces = [
    makeTriangleFace([i0, i1, i2], points, interior),
    makeTriangleFace([i0, i1, i3], points, interior),
    makeTriangleFace([i0, i2, i3], points, interior),
    makeTriangleFace([i1, i2, i3], points, interior),
  ].filter(Boolean);

  const used = new Set(initialIndices);

  for (let p = 0; p < points.length; p += 1) {
    if (used.has(p)) continue;
    const candidate = points[p];

    // Find the most visible face as seed
    let bestFace = -1;
    let bestDist = 1e-6;
    for (let f = 0; f < faces.length; f += 1) {
      const dist = dot(faces[f].normal, subtract(candidate, points[faces[f].indices[0]]));
      if (dist > bestDist) {
        bestDist = dist;
        bestFace = f;
      }
    }
    if (bestFace < 0) continue;

    // Build edge-to-face adjacency on current manifold hull
    const undirectedEdgeFaces = new Map();
    for (let f = 0; f < faces.length; f += 1) {
      const idx = faces[f].indices;
      for (let e = 0; e < 3; e += 1) {
        const a = idx[e];
        const b = idx[(e + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!undirectedEdgeFaces.has(key)) undirectedEdgeFaces.set(key, []);
        undirectedEdgeFaces.get(key).push(f);
      }
    }

    // Flood-fill connected visible patch from bestFace so the patch is a single topological disk
    const visible = new Set([bestFace]);
    const queue = [bestFace];
    while (queue.length > 0) {
      const current = queue.pop();
      const idx = faces[current].indices;
      for (let e = 0; e < 3; e += 1) {
        const a = idx[e];
        const b = idx[(e + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const neighbors = undirectedEdgeFaces.get(key) ?? [];
        for (const nb of neighbors) {
          if (visible.has(nb)) continue;
          const dist = dot(faces[nb].normal, subtract(candidate, points[faces[nb].indices[0]]));
          if (dist > 1e-7) {
            visible.add(nb);
            queue.push(nb);
          }
        }
      }
    }

    // Ensure the visible patch has no pinch vertices or isolatedears (disk regularization)
    let changed = true;
    while (changed) {
      changed = false;
      for (let f = 0; f < faces.length; f += 1) {
        if (visible.has(f)) continue;
        const idx = faces[f].indices;
        let sharedWithVisible = 0;
        for (let e = 0; e < 3; e += 1) {
          const a = idx[e];
          const b = idx[(e + 1) % 3];
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          const neighbors = undirectedEdgeFaces.get(key) ?? [];
          if (neighbors.some((nb) => visible.has(nb))) sharedWithVisible += 1;
        }
        if (sharedWithVisible >= 2) {
          visible.add(f);
          changed = true;
        }
      }
    }

    if (visible.size >= faces.length) continue;

    // Extract directed horizon edges (u -> v) around the visible patch
    const directedEdges = new Set();
    for (const f of visible) {
      const [a, b, c] = faces[f].indices;
      directedEdges.add(`${a}:${b}`);
      directedEdges.add(`${b}:${c}`);
      directedEdges.add(`${c}:${a}`);
    }

    const horizon = [];
    for (const edge of directedEdges) {
      const [uStr, vStr] = edge.split(':');
      const reverse = `${vStr}:${uStr}`;
      if (!directedEdges.has(reverse)) {
        horizon.push([Number(uStr), Number(vStr)]);
      }
    }

    const newFaces = [];
    let validCone = horizon.length >= 3;
    for (const [u, v] of horizon) {
      const tri = makeTriangleFace([u, v, p], points, interior);
      if (!tri) {
        validCone = false;
        break;
      }
      newFaces.push(tri);
    }
    if (!validCone) continue;

    faces = faces.filter((_, idx) => !visible.has(idx)).concat(newFaces);
    used.add(p);
  }

  return faces.map(({ indices, normal }) => ({
    indices,
    normal,
    points: indices.map((idx) => rawPoints[idx]),
  }));
}

/**
 * Generate a sharp, high-variation convex rock polyhedron with distinct geological archetypes
 * ('slab', 'blocky', 'jagged', 'columnar', 'rubble', 'spire') and planar cleavage cuts.
 */
export function makeRockPolyhedron(seed = 1, size = { x: 1.2, y: 1, z: 0.9 }, rockType = 'blocky') {
  const random = seededRandom((Number(seed) ^ 0x18d5a73b) >>> 0);

  // Per-rock morphological variation (anisotropic stretch, wedge taper, bedding shear, ridge axes)
  const stretchX = 0.80 + random() * 0.44;
  const stretchY = 0.78 + random() * 0.46;
  const stretchZ = 0.80 + random() * 0.44;
  const shearXY = (random() - 0.5) * (rockType === 'columnar' ? 0.08 : 0.32);
  const shearZY = (random() - 0.5) * (rockType === 'columnar' ? 0.08 : 0.28);
  const taperY = (random() - 0.5) * (rockType === 'spire' ? -0.58 : 0.36);
  const taperX = (random() - 0.5) * 0.34;
  const prowAngle = random() * Math.PI * 2;
  const secondRidgeAngle = prowAngle + (0.62 + random() * 0.76) * Math.PI;

  // Cleavage plane normal for planar facet flattening
  const cleaveYaw = random() * Math.PI * 2;
  const cleavePitch = (random() - 0.5) * 1.2;
  const cleaveNormal = normalize({
    x: Math.cos(cleaveYaw) * Math.cos(cleavePitch),
    y: Math.sin(cleavePitch),
    z: Math.sin(cleaveYaw) * Math.cos(cleavePitch),
  });

  const points = [];

  if (rockType === 'slab') {
    // Crisp tabular rock plate / cantilevered cliff shelf with flat bedding planes and sharp faceted rim
    const rimCount = 6 + Math.floor(random() * 3); // 6..8 corners per ring -> 12..16 bold sharp vertices
    const flatness = 0.30 + random() * 0.26;
    const cantAngle = (random() - 0.5) * 0.16;
    const stepLedge = (random() - 0.5) * 0.28;

    for (let i = 0; i < rimCount; i += 1) {
      const baseAngle = (i / rimCount) * Math.PI * 2 + (random() - 0.5) * (0.42 / rimCount) * Math.PI;
      const prowBoost = 1 + 0.34 * Math.max(0, Math.cos(baseAngle - prowAngle)) + 0.18 * Math.cos(2 * baseAngle + stepLedge);
      const rTop = (0.74 + random() * 0.38) * prowBoost;
      const rBot = (0.64 + random() * 0.38) * (0.90 + 0.22 * Math.sin(baseAngle - secondRidgeAngle));

      const tx = Math.cos(baseAngle) * rTop;
      const tz = Math.sin(baseAngle) * rTop;
      const bx = Math.cos(baseAngle + 0.11) * rBot;
      const bz = Math.sin(baseAngle + 0.11) * rBot;

      const topY = flatness * (0.88 + (random() - 0.5) * 0.08) + tx * cantAngle;
      const botY = -flatness * (0.88 + (random() - 0.5) * 0.10) + bx * cantAngle * 0.6;

      points.push({
        x: (tx + topY * shearXY * 0.5) * size.x * stretchX,
        y: topY * size.y,
        z: (tz + topY * shearZY * 0.5) * size.z * stretchZ,
      });
      points.push({
        x: (bx + botY * shearXY * 0.5) * size.x * stretchX,
        y: botY * size.y,
        z: (bz + botY * shearZY * 0.5) * size.z * stretchZ,
      });
    }
  } else if (rockType === 'columnar') {
    // True 5-, 6-, or 7-sided polygonal basalt column prism with chiseled cross-joint caps
    const sides = 5 + Math.floor(random() * 3);
    const phase = random() * Math.PI * 2;
    const topTiltX = (random() - 0.5) * 0.26;
    const topTiltZ = (random() - 0.5) * 0.26;
    const botTiltX = (random() - 0.5) * 0.24;
    const botTiltZ = (random() - 0.5) * 0.24;
    const columnTaper = 0.86 + random() * 0.24;

    for (let s = 0; s < sides; s += 1) {
      const angle = phase + (s / sides) * Math.PI * 2 + (random() - 0.5) * 0.14;
      const radius = 0.85 + (random() - 0.5) * 0.24;
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;

      const topY = 0.94 + cx * topTiltX + cz * topTiltZ;
      const botY = -0.94 + cx * botTiltX + cz * botTiltZ;

      points.push({
        x: (cx * columnTaper + topY * shearXY) * size.x,
        y: topY * size.y,
        z: (cz * columnTaper + topY * shearZY) * size.z,
      });
      points.push({
        x: (cx + botY * shearXY) * size.x,
        y: botY * size.y,
        z: (cz + botY * shearZY) * size.z,
      });
    }
  } else {
    // Bold, sharp low-poly generator for 'blocky', 'jagged', 'rubble', and 'spire'
    const profiles = {
      blocky: { pointCount: 11 + Math.floor(random() * 4), exponent: 0.62 + random() * 0.24, radialVar: 0.30 + random() * 0.18 },
      jagged: { pointCount: 12 + Math.floor(random() * 4), exponent: 0.50 + random() * 0.22, radialVar: 0.46 + random() * 0.22 },
      rubble: { pointCount: 9 + Math.floor(random() * 4), exponent: 0.64 + random() * 0.24, radialVar: 0.38 + random() * 0.22 },
      spire: { pointCount: 11 + Math.floor(random() * 4), exponent: 0.54 + random() * 0.20, radialVar: 0.40 + random() * 0.22 },
    };
    const profile = profiles[rockType] ?? profiles.blocky;
    const pointCount = profile.pointCount;
    const azimuthPhase = random() * Math.PI * 2;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < pointCount; index += 1) {
      const vertical = clamp(1 - (2 * (index + 0.5)) / pointCount + (random() - 0.5) * 0.18, -0.98, 0.98);
      const azimuth = azimuthPhase + index * goldenAngle + (random() - 0.5) * 0.36;
      const ring = Math.sqrt(Math.max(0, 1 - vertical * vertical));

      // Directional angular ridges (creates strong planar facets and sharp arrises)
      const ridge1 = Math.max(0, Math.cos(azimuth - prowAngle));
      const ridge2 = Math.max(0, Math.cos(2 * (azimuth - secondRidgeAngle)));
      const ridgeBoost = 1 + (rockType === 'jagged' || rockType === 'spire' ? 0.38 : 0.22) * ridge1 + 0.16 * ridge2;

      const radius = (1 - profile.radialVar * 0.45 + random() * profile.radialVar) * ridgeBoost;
      let dirX = Math.cos(azimuth) * ring;
      let dirY = vertical;
      let dirZ = Math.sin(azimuth) * ring;

      // Planar cleavage compression along cleaveNormal so stones have flat chiseled faces
      const cleaveProj = dirX * cleaveNormal.x + dirY * cleaveNormal.y + dirZ * cleaveNormal.z;
      if (cleaveProj > 0.38) {
        const excess = (cleaveProj - 0.38) * 0.55;
        dirX -= cleaveNormal.x * excess;
        dirY -= cleaveNormal.y * excess;
        dirZ -= cleaveNormal.z * excess;
      }

      const shaped = (value) => Math.sign(value) * Math.pow(Math.abs(value), profile.exponent);
      const taperScale = rockType === 'spire'
        ? clamp(1.22 - 0.58 * ((dirY + 1) * 0.5), 0.38, 1.38)
        : clamp(1 + taperY * dirY + taperX * dirX, 0.58, 1.42);

      const sx = (shaped(dirX) * taperScale + dirY * shearXY) * radius * size.x * stretchX;
      const sy = shaped(dirY) * radius * size.y * stretchY * (rockType === 'spire' ? 1.35 : 1);
      const sz = (shaped(dirZ) * taperScale + dirY * shearZY) * radius * size.z * stretchZ;

      points.push({ x: sx, y: sy, z: sz });
    }
  }

  const hullTriangles = convexHullFaces(points);
  return hullTriangles.map(({ points: triPoints }) => ({
    points: triPoints,
    kind: 'rock',
    tone: random(),
  }));
}

export function polyhedronVolume(faces) {
  let signedVolume = 0;
  for (const face of faces) {
    if (face.points.length < 3) continue;
    const origin = face.points[0];
    for (let index = 1; index < face.points.length - 1; index += 1) {
      signedVolume += dot(origin, cross(face.points[index], face.points[index + 1])) / 6;
    }
  }
  return Math.abs(signedVolume);
}

export function polyhedronVertices(faces) {
  const vertices = new Map();
  for (const face of faces) {
    for (const point of face.points) vertices.set(pointKey(point), point);
  }
  return [...vertices.values()];
}

export function faceArea(face) {
  if (face.length < 3) return 0;
  const origin = face[0];
  let areaVector = { x: 0, y: 0, z: 0 };
  for (let index = 1; index < face.length - 1; index += 1) {
    areaVector = add(areaVector, cross(subtract(face[index], origin), subtract(face[index + 1], origin)));
  }
  return magnitude(areaVector) * 0.5;
}

function sortOnPlane(points, normal) {
  const center = average(points);
  const reference = Math.abs(normal.y) < 0.82 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const axisU = normalize(cross(reference, normal));
  const axisV = cross(normal, axisU);
  return points.slice().sort((a, b) => {
    const da = subtract(a, center);
    const db = subtract(b, center);
    const angleA = Math.atan2(dot(da, axisV), dot(da, axisU));
    const angleB = Math.atan2(dot(db, axisV), dot(db, axisU));
    return angleA - angleB;
  });
}

function facePlaneIntersections(face, normal, offset) {
  const intersections = [];
  const points = face.points;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const startDistance = dot(normal, start) - offset;
    const endDistance = dot(normal, end) - offset;

    if (Math.abs(startDistance) <= 1e-7) intersections.push(start);
    if ((startDistance < -1e-7 && endDistance > 1e-7) || (startDistance > 1e-7 && endDistance < -1e-7)) {
      const amount = startDistance / (startDistance - endDistance);
      intersections.push({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
        z: start.z + (end.z - start.z) * amount,
      });
    }
  }

  return uniquePoints(intersections);
}

function clipFace(face, normal, offset, keepNegative) {
  const output = [];
  const intersections = [];
  const points = face.points;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const startDistance = dot(normal, start) - offset;
    const endDistance = dot(normal, end) - offset;
    const startInside = keepNegative ? startDistance <= 1e-7 : startDistance >= -1e-7;
    const endInside = keepNegative ? endDistance <= 1e-7 : endDistance >= -1e-7;

    if (startInside && endInside) {
      output.push(end);
    } else if (startInside && !endInside) {
      const amount = startDistance / (startDistance - endDistance);
      const intersection = {
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
        z: start.z + (end.z - start.z) * amount,
      };
      output.push(intersection);
      intersections.push(intersection);
    } else if (!startInside && endInside) {
      const amount = startDistance / (startDistance - endDistance);
      const intersection = {
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
        z: start.z + (end.z - start.z) * amount,
      };
      output.push(intersection, end);
      intersections.push(intersection);
    }
  }

  return { points: cleanFace(output), intersections: uniquePoints(intersections) };
}

function splitPolyhedron(faces, normal, offset, capKind = 'fracture', capTone = 0.15, cutId = 0) {
  const negativeFaces = [];
  const positiveFaces = [];
  const capPoints = [];
  const surfaceSegments = [];
  let abutsOlderJoint = false;

  for (const face of faces) {
    const negative = clipFace(face, normal, offset, true);
    const positive = clipFace(face, normal, offset, false);
    if (negative.points.length >= 3) negativeFaces.push({ ...face, points: negative.points, splitHistory: (face.splitHistory ?? 0) + (positive.points.length >= 3 ? 1 : 0) });
    if (positive.points.length >= 3) positiveFaces.push({ ...face, points: positive.points, splitHistory: (face.splitHistory ?? 0) + (negative.points.length >= 3 ? 1 : 0) });

    const faceCrossings = facePlaneIntersections(face, normal, offset);
    capPoints.push(...faceCrossings);
    if (face.kind === 'fracture' && faceCrossings.length >= 2) abutsOlderJoint = true;

    if (faceCrossings.length === 2) {
      const faceNormal = normalize(cross(
        subtract(face.points[1], face.points[0]),
        subtract(face.points[2], face.points[0]),
      ));
      surfaceSegments.push({
        a: faceCrossings[0],
        b: faceCrossings[1],
        normal: faceNormal,
        kind: face.kind,
      });
    }
  }

  const cap = uniquePoints(capPoints, 1e-10);
  if (cap.length < 3) return null;
  const orderedCap = sortOnPlane(cap, normal);
  if (faceArea(orderedCap) < 1e-7) return null;

  negativeFaces.push({ points: orderedCap, kind: capKind, tone: capTone, cutId, cutSide: -1, splitHistory: 0 });
  positiveFaces.push({ points: orderedCap.slice().reverse(), kind: capKind, tone: capTone, cutId, cutSide: 1, splitHistory: 0 });

  return {
    negative: negativeFaces,
    positive: positiveFaces,
    cap: orderedCap,
    surfaceSegments,
    abutsOlderJoint,
  };
}

function projectionBounds(faces, normal) {
  const vertices = polyhedronVertices(faces);
  const values = vertices.map((point) => dot(normal, point));
  return { min: Math.min(...values), max: Math.max(...values) };
}

function pickNormal(random, azimuth, isPrimary, wander) {
  const localVariation = 0.08 + 0.74 * wander;
  if (isPrimary) {
    const yaw = azimuth + (random() - 0.5) * 0.24 * localVariation;
    return normalize({ x: Math.cos(yaw), y: (random() - 0.5) * (0.08 + 0.38 * wander), z: Math.sin(yaw) });
  }

  if (random() < 0.68) {
    const yaw = azimuth + Math.PI / 2 + (random() - 0.5) * (0.20 + 0.88 * wander);
    return normalize({ x: Math.cos(yaw), y: (random() - 0.5) * (0.20 + 0.82 * wander), z: Math.sin(yaw) });
  }

  const yaw = azimuth + (random() - 0.5) * (0.16 + 0.48 * wander);
  const tilt = (random() < 0.5 ? -1 : 1) * (0.58 + random() * 0.34);
  return normalize({ x: Math.cos(yaw) * 0.35, y: tilt, z: Math.sin(yaw) * 0.35 });
}

function choosePieceIndex(pieces, rootVolume, minimumFraction, random, preferLargest) {
  const candidates = pieces
    .map((piece, index) => ({ index, volume: polyhedronVolume(piece.faces) }))
    .filter((piece) => piece.volume >= rootVolume * minimumFraction)
    .sort((left, right) => right.volume - left.volume);
  if (!candidates.length) return -1;
  if (preferLargest) return candidates[0].index;

  const pool = candidates.slice(0, Math.min(7, candidates.length));
  const weights = pool.map((piece) => Math.pow(piece.volume, 0.78));
  let selection = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < pool.length; index += 1) {
    selection -= weights[index];
    if (selection <= 0) return pool[index].index;
  }
  return pool[pool.length - 1].index;
}

function extendShift(shift, normal, sign) {
  return add(shift, multiply(normal, sign * 0.5));
}

export function generateFractureNetwork(outlineFaces, options = {}) {
  if (!Array.isArray(outlineFaces) || outlineFaces.length < 4) {
    throw new TypeError('A 3D fracture network needs a closed polyhedron with at least four faces.');
  }

  const seed = Number(options.seed ?? 1) >>> 0;
  const random = seededRandom(seed);
  const density = clamp(Number(options.density ?? 58), 0, 100) / 100;
  const wander = clamp(Number(options.wander ?? 48), 0, 100) / 100;
  const azimuth = (Number(options.angle ?? -8) * Math.PI) / 180;
  const rootVolume = polyhedronVolume(outlineFaces);
  const plannedCuts = Math.max(0, Math.round(options.cutCount ?? (4 + density * 10)));
  const primaryCuts = Math.min(plannedCuts, Math.max(1, Math.round(options.primaryCuts ?? (1 + density * 3))));
  const minimumPieceFraction = 0.007 + density * 0.006;
  let pieces = [{ faces: outlineFaces, shift: { x: 0, y: 0, z: 0 } }];
  const states = [pieces.slice()];
  const events = [];

  for (let cutIndex = 0; cutIndex < plannedCuts; cutIndex += 1) {
    const isPrimary = cutIndex < primaryCuts;
    let accepted = false;

    for (let attempt = 0; attempt < 30 && !accepted; attempt += 1) {
      const pieceIndex = choosePieceIndex(
        pieces,
        rootVolume,
        minimumPieceFraction * (isPrimary ? 0.7 : 1),
        random,
        isPrimary,
      );
      if (pieceIndex < 0) break;

      const parent = pieces[pieceIndex];
      const parentVolume = polyhedronVolume(parent.faces);
      const normal = pickNormal(random, azimuth, isPrimary, wander);
      const bounds = projectionBounds(parent.faces, normal);
      const span = bounds.max - bounds.min;
      if (span < 1e-5) continue;

      const offset = bounds.min + span * (0.18 + random() * 0.64);
      const nextEventId = events.length + 1;
      const cut = splitPolyhedron(parent.faces, normal, offset, 'fracture', 0.15, nextEventId);
      if (!cut) continue;

      const negativeVolume = polyhedronVolume(cut.negative);
      const positiveVolume = polyhedronVolume(cut.positive);
      const minimumChildVolume = Math.max(rootVolume * minimumPieceFraction, parentVolume * 0.035);
      if (negativeVolume < minimumChildVolume || positiveVolume < minimumChildVolume) continue;

      const kind = isPrimary ? 'primary' : cut.abutsOlderJoint ? 'abutting' : 'secondary';
      const event = {
        id: nextEventId,
        generation: isPrimary ? 1 : (cut.abutsOlderJoint ? 3 : 2),
        kind,
        normal,
        offset,
        cap: cut.cap,
        surfaceSegments: cut.surfaceSegments,
        parentShift: parent.shift,
        area: faceArea(cut.cap),
        aperture: (0.004 + random() * 0.004) * (isPrimary ? 1.25 : 1),
        propagationNoise: 0.15 + wander * 0.85,
      };

      const negativePiece = { faces: cut.negative, shift: extendShift(parent.shift, normal, -1), parentShift: parent.shift };
      const positivePiece = { faces: cut.positive, shift: extendShift(parent.shift, normal, 1), parentShift: parent.shift };
      pieces.splice(pieceIndex, 1, negativePiece, positivePiece);
      events.push(event);
      states.push(pieces.slice());
      accepted = true;
    }

    if (!accepted && cutIndex >= primaryCuts) break;
  }

  return {
    seed,
    outline: outlineFaces,
    events,
    states,
    finalPieces: pieces,
    rootVolume,
    metrics: {
      requestedCuts: plannedCuts,
      completedCuts: events.length,
      fragments: pieces.length,
      generations: new Set(events.map((event) => event.generation)).size,
    },
  };
}

/**
 * Convert fractured rock pieces (with opened joints) into a sealed, watertight 2-manifold polygonal mesh.
 * Instead of leaving open holes or floating disconnected pieces when joints open, each fracture face
 * is beveled inward into a deep, sharp 3D fissure and either welded directly to its opposite half
 * (when unsplit) or sealed with a recessed fissure floor at the cut plane.
 */
export function buildSealedRockMesh(pieces, options = {}) {
  const gapDistance = Math.max(0, Number(options.gapDistance ?? 0.04));
  const grooveInset = clamp(Number(options.grooveInset ?? 0.28), 0.12, 0.55);

  // Identify cutIds whose negative and positive fracture caps were never split by a later cut
  // so they can be topologically welded across a shared inner neck ring with zero internal cap!
  const cutFaceRegistry = new Map();
  if (gapDistance > 1e-6) {
    pieces.forEach((piece, pieceIndex) => {
      piece.faces.forEach((face, faceIndex) => {
        if (face.kind !== 'fracture' || !face.cutId) return;
        if (!cutFaceRegistry.has(face.cutId)) cutFaceRegistry.set(face.cutId, []);
        cutFaceRegistry.get(face.cutId).push({ piece, pieceIndex, face, faceIndex });
      });
    });
  }

  const weldableCuts = new Map();
  for (const [cutId, entries] of cutFaceRegistry.entries()) {
    if (entries.length === 2 && (entries[0].face.splitHistory ?? 0) === 0 && (entries[1].face.splitHistory ?? 0) === 0) {
      const neg = entries.find((e) => e.face.cutSide === -1);
      const pos = entries.find((e) => e.face.cutSide === 1);
      if (neg && pos && neg.face.points.length === pos.face.points.length) {
        const canonicalPoints = neg.face.points;
        const center = average(canonicalPoints);
        const midShift = multiply(add(neg.piece.shift, pos.piece.shift), 0.5 * gapDistance);
        const neckRing = canonicalPoints.map((pt) => add(lerpPoint(pt, center, grooveInset), midShift));
        weldableCuts.set(cutId, neckRing);
      }
    }
  }

  const sealedFaces = [];

  pieces.forEach((piece, pieceIndex) => {
    const shiftVec = multiply(piece.shift ?? { x: 0, y: 0, z: 0 }, gapDistance);

    for (const face of piece.faces) {
      if (face.points.length < 3) continue;
      const outerRing = face.points.map((pt) => add(pt, shiftVec));

      if (face.kind !== 'fracture' || gapDistance <= 1e-6) {
        sealedFaces.push({
          points: outerRing,
          kind: face.kind,
          tone: face.tone ?? 0.5,
          pieceIndex,
        });
        continue;
      }

      // Bevel fracture face inward from outerRing to recessed innerRing
      const weldedNeck = face.cutId ? weldableCuts.get(face.cutId) : null;
      if (weldedNeck) {
        const innerRing = face.cutSide === -1 ? weldedNeck : weldedNeck.slice().reverse();
        const count = outerRing.length;
        for (let i = 0; i < count; i += 1) {
          const next = (i + 1) % count;
          sealedFaces.push({
            points: [outerRing[i], outerRing[next], innerRing[next], innerRing[i]],
            kind: 'fracture',
            tone: face.tone ?? 0.15,
            pieceIndex,
          });
        }
      } else {
        // Sub-split / abutting fracture face: bevel back to the recessed cut plane and seal with a fissure floor
        const center = average(face.points);
        const rootShift = multiply(piece.shift ?? { x: 0, y: 0, z: 0 }, gapDistance * 0.06);
        const innerRing = face.points.map((pt) => add(lerpPoint(pt, center, grooveInset), rootShift));
        const count = outerRing.length;
        for (let i = 0; i < count; i += 1) {
          const next = (i + 1) % count;
          sealedFaces.push({
            points: [outerRing[i], outerRing[next], innerRing[next], innerRing[i]],
            kind: 'fracture',
            tone: face.tone ?? 0.15,
            pieceIndex,
          });
        }
        sealedFaces.push({
          points: innerRing,
          kind: 'fracture',
          tone: 0.08,
          pieceIndex,
        });
      }
    }
  });

  return sealedFaces;
}

const CLIFF_LAYOUT = [
  { position: [-0.83, -0.99, 0.02], size: [1.12, 0.68, 0.86], rotation: [0.01, -0.08, -0.04], rockType: 'blocky' },
  { position: [0.80, -1.01, 0.02], size: [1.15, 0.68, 0.82], rotation: [-0.02, 0.13, 0.035], rockType: 'slab' },
  { position: [-0.88, -0.11, -0.02], size: [0.92, 0.68, 0.76], rotation: [0.025, 0.16, 0.03], rockType: 'jagged' },
  { position: [0.79, -0.06, -0.08], size: [0.96, 0.73, 0.78], rotation: [-0.015, -0.17, -0.025], rockType: 'blocky' },
  { position: [-0.02, 0.78, -0.04], size: [0.61, 1.15, 0.66], rotation: [0.02, 0.06, -0.02], rockType: 'columnar' },
  { position: [0.03, 0.00, -0.91], size: [0.88, 0.77, 0.53], rotation: [-0.035, 0.2, 0.01], rockType: 'rubble' },
];

export function buildCliffNetworks(options = {}) {
  const baseSeed = Number(options.seed ?? 1) >>> 0;
  return CLIFF_LAYOUT.map((layout, index) => {
    const rockSeed = (baseSeed + 977 * (index + 1)) >>> 0;
    const outline = makeRockPolyhedron(rockSeed, { x: layout.size[0], y: layout.size[1], z: layout.size[2] }, layout.rockType);
    return {
      ...generateFractureNetwork(outline, {
        ...options,
        seed: rockSeed,
        density: clamp(Number(options.density ?? 58) * 0.34, 8, 38),
        angle: Number(options.angle ?? -8) + ((index % 3) - 1) * 7,
      }),
      rockType: layout.rockType,
      transform: { position: layout.position.slice(), rotation: layout.rotation.slice() },
    };
  });
}

export function networkToJSON(network) {
  const encodeFace = (face) => ({
    type: face.kind,
    vertices: face.points.map(encodePoint),
  });

  const sealedFaces = buildSealedRockMesh(network.finalPieces, { gapDistance: 0.035 });

  return {
    seed: network.seed,
    rootVolume: round(network.rootVolume),
    outlineFaces: network.outline.map(encodeFace),
    sealedMeshFaces: sealedFaces.map(encodeFace),
    fragments: network.finalPieces.map((piece) => ({
      visualShift: encodePoint(piece.shift),
      faces: piece.faces.map(encodeFace),
    })),
    joints: network.events.map((event) => ({
      id: event.id,
      generation: event.generation,
      kind: event.kind,
      planeNormal: encodePoint(event.normal),
      planeOffset: round(event.offset),
      aperture: round(event.aperture),
      fractureFaceArea: round(event.area),
      fractureFace: event.cap.map(encodePoint),
    })),
  };
}

function encodePoint(point) {
  return [round(point.x), round(point.y), round(point.z)];
}

function round(value) {
  return Number(value.toFixed(5));
}
