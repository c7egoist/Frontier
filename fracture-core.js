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

function convexHullFaces(points) {
  const interior = average(points);
  const triangles = [];
  const seen = new Set();

  for (let i = 0; i < points.length - 2; i += 1) {
    for (let j = i + 1; j < points.length - 1; j += 1) {
      for (let k = j + 1; k < points.length; k += 1) {
        let normal = cross(subtract(points[j], points[i]), subtract(points[k], points[i]));
        if (magnitude(normal) < 1e-7) continue;
        normal = normalize(normal);

        let positive = false;
        let negative = false;
        for (let p = 0; p < points.length; p += 1) {
          if (p === i || p === j || p === k) continue;
          const side = dot(normal, subtract(points[p], points[i]));
          if (side > 1e-7) positive = true;
          if (side < -1e-7) negative = true;
          if (positive && negative) break;
        }
        if (positive && negative) continue;

        let indices = [i, j, k];
        if (dot(normal, subtract(interior, points[i])) > 0) {
          indices = [i, k, j];
          normal = multiply(normal, -1);
        }
        const key = indices.slice().sort((a, b) => a - b).join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        triangles.push({ indices, normal });
      }
    }
  }

  if (triangles.length < 4) throw new Error('Could not construct a closed 3D rock hull from this seed.');
  return triangles;
}

/** Generate an irregular convex rock shell made from flat polygon facets. */
export function makeRockPolyhedron(seed = 1, size = { x: 1.2, y: 1, z: 0.9 }, rockType = 'blocky') {
  const random = seededRandom((Number(seed) ^ 0x18d5a73b) >>> 0);
  const shapeProfiles = {
    // Fewer hull vertices make each plane larger and the arrises more legible;
    // the jagged archetype keeps a few extra corners, not a field of micro-facets.
    slab: { pointCount: 9, exponent: 0.82, radialVariation: 0.10 },
    blocky: { pointCount: 10, exponent: 0.90, radialVariation: 0.14 },
    jagged: { pointCount: 12, exponent: 0.76, radialVariation: 0.27 },
    columnar: { pointCount: 10, exponent: 0.88, radialVariation: 0.13 },
    rubble: { pointCount: 9, exponent: 0.78, radialVariation: 0.23 },
  };
  const profile = shapeProfiles[rockType] ?? shapeProfiles.blocky;
  const points = [];
  const pointCount = profile.pointCount;
  const azimuthPhase = random() * Math.PI * 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < pointCount; index += 1) {
    // Evenly distribute corner candidates to avoid tiny, accidental sliver faces.
    const vertical = clamp(1 - 2 * (index + 0.5) / pointCount + (random() - 0.5) * 0.12, -0.99, 0.99);
    const azimuth = azimuthPhase + index * goldenAngle + (random() - 0.5) * 0.22;
    const ring = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const radius = 1 - profile.radialVariation * 0.5 + random() * profile.radialVariation;
    const direction = {
      x: Math.cos(azimuth) * ring,
      y: vertical,
      z: Math.sin(azimuth) * ring,
    };
    // Shape archetypes alter the solid silhouette only; no surface texture is sampled.
    const shaped = (value) => Math.sign(value) * Math.pow(Math.abs(value), profile.exponent);
    points.push({
      x: shaped(direction.x) * radius * size.x,
      y: shaped(direction.y) * radius * size.y,
      z: shaped(direction.z) * radius * size.z,
    });
  }

  const triangles = convexHullFaces(points);
  return triangles.map(({ indices }) => ({
    points: indices.map((index) => points[index]),
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

function splitPolyhedron(faces, normal, offset) {
  const negativeFaces = [];
  const positiveFaces = [];
  const capPoints = [];
  const surfaceSegments = [];
  let abutsOlderJoint = false;

  for (const face of faces) {
    const negative = clipFace(face, normal, offset, true);
    const positive = clipFace(face, normal, offset, false);
    if (negative.points.length >= 3) negativeFaces.push({ ...face, points: negative.points });
    if (positive.points.length >= 3) positiveFaces.push({ ...face, points: positive.points });

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

  const capTone = 0.15;
  negativeFaces.push({ points: orderedCap, kind: 'fracture', tone: capTone });
  positiveFaces.push({ points: orderedCap.slice().reverse(), kind: 'fracture', tone: capTone });

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
    const yaw = azimuth + (random() - 0.5) * 0.2 * localVariation;
    return normalize({ x: Math.cos(yaw), y: (random() - 0.5) * (0.06 + 0.38 * wander), z: Math.sin(yaw) });
  }

  if (random() < 0.68) {
    const yaw = azimuth + Math.PI / 2 + (random() - 0.5) * (0.18 + 0.88 * wander);
    return normalize({ x: Math.cos(yaw), y: (random() - 0.5) * (0.18 + 0.82 * wander), z: Math.sin(yaw) });
  }

  const yaw = azimuth + (random() - 0.5) * (0.14 + 0.48 * wander);
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
      const cut = splitPolyhedron(parent.faces, normal, offset);
      if (!cut) continue;

      const negativeVolume = polyhedronVolume(cut.negative);
      const positiveVolume = polyhedronVolume(cut.positive);
      const minimumChildVolume = Math.max(rootVolume * minimumPieceFraction, parentVolume * 0.035);
      if (negativeVolume < minimumChildVolume || positiveVolume < minimumChildVolume) continue;

      const kind = isPrimary ? 'primary' : cut.abutsOlderJoint ? 'abutting' : 'secondary';
      const event = {
        id: events.length + 1,
        generation: isPrimary ? 1 : 2,
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

      const negativePiece = { faces: cut.negative, shift: extendShift(parent.shift, normal, -1) };
      const positivePiece = { faces: cut.positive, shift: extendShift(parent.shift, normal, 1) };
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

const CLIFF_LAYOUT = [
  { position: [-0.83, -0.99, 0.02], size: [1.12, 0.68, 0.86], rotation: [0.01, -0.08, -0.04] },
  { position: [0.80, -1.01, 0.02], size: [1.15, 0.68, 0.82], rotation: [-0.02, 0.13, 0.035] },
  { position: [-0.88, -0.11, -0.02], size: [0.92, 0.68, 0.76], rotation: [0.025, 0.16, 0.03] },
  { position: [0.79, -0.06, -0.08], size: [0.96, 0.73, 0.78], rotation: [-0.015, -0.17, -0.025] },
  { position: [-0.02, 0.78, -0.04], size: [0.61, 1.15, 0.66], rotation: [0.02, 0.06, -0.02] },
  { position: [0.03, 0.00, -0.91], size: [0.88, 0.77, 0.53], rotation: [-0.035, 0.2, 0.01] },
];

export function buildCliffNetworks(options = {}) {
  const baseSeed = Number(options.seed ?? 1) >>> 0;
  return CLIFF_LAYOUT.map((layout, index) => {
    const rockSeed = (baseSeed + 977 * (index + 1)) >>> 0;
    const outline = makeRockPolyhedron(rockSeed, { x: layout.size[0], y: layout.size[1], z: layout.size[2] });
    return {
      ...generateFractureNetwork(outline, {
        ...options,
        seed: rockSeed,
        density: clamp(Number(options.density ?? 58) * 0.34, 8, 38),
        angle: Number(options.angle ?? -8) + ((index % 3) - 1) * 7,
      }),
      transform: { position: layout.position.slice(), rotation: layout.rotation.slice() },
    };
  });
}

export function networkToJSON(network) {
  const encodeFace = (face) => ({
    type: face.kind,
    vertices: face.points.map(encodePoint),
  });

  return {
    seed: network.seed,
    rootVolume: round(network.rootVolume),
    outlineFaces: network.outline.map(encodeFace),
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
