import {
  clamp,
  generateFractureNetwork,
  makeRockPolyhedron,
  polyhedronVertices,
  seededRandom,
} from './fracture-core.js';

const CLIFF_PROFILES = {
  layered: {
    name: 'Layered sedimentary escarpment',
    description: 'Asymmetric sandstone headland, stepped ledges, a recessed gully, and talus at the toe.',
    weights: { slab: 0.54, blocky: 0.30, jagged: 0.16 },
    palette: ['#8b857a', '#969083', '#77766f', '#a09787', '#858276'],
    fractureRate: 0.36,
  },
  basalt: {
    name: 'Columnar basalt face',
    description: 'A crowned, narrowing basalt mass with columnar outcrops and a broken rock apron.',
    weights: { columnar: 0.68, blocky: 0.22, rubble: 0.10 },
    palette: ['#6e7473', '#7a7b76', '#626b6d', '#85837b'],
    fractureRate: 0.44,
  },
  breccia: {
    name: 'Breccia / talus cliff',
    description: 'A lumpy, sloping breccia face with varied block sizes and a broad talus toe.',
    weights: { jagged: 0.55, rubble: 0.29, slab: 0.16 },
    palette: ['#827b70', '#92877a', '#716f69', '#9a8e7c', '#77756f'],
    fractureRate: 0.40,
  },
};

const BASE_GRID = { minX: -8.88, minY: -5.12, maxX: 8.88, maxY: 4.88, columns: 9, rows: 6 };

const DEFAULT_BOUNDS = { minX: -8.88, minY: -5.12, minZ: -2.48, maxX: 8.88, maxY: 4.88, maxZ: 2.08 };
const TETRAHEDRA = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

function makeCliffBase(type, seed, options = {}) {
  const random = seededRandom((Number(seed) ^ 0x6a09e667) >>> 0);
  const contourStrength = clamp(Number(options.cliffContour ?? 78), 0, 100) / 100;
  const reliefStrength = clamp(Number(options.cliffRelief ?? 62), 0, 100) / 100;
  const bottomY = -4.55;
  const ridge = [];
  const ridgeCount = 13;
  for (let index = 0; index < ridgeCount; index += 1) {
    const x = -7.6 + (15.2 * index) / (ridgeCount - 1);
    const side = Math.abs(x) / 7.6;
    let baseHeight;
    let detail;
    if (type === 'layered') {
      baseHeight = 3.05;
      detail = 0.34 * Math.sin(x * 0.52) + 0.20 * Math.sin(x * 1.13);
      detail += 0.55 * Math.exp(-((x + 2.25) ** 2) / 7.5) - 0.52 * Math.exp(-((x - 2.1) ** 2) / 1.9);
    } else if (type === 'basalt') {
      baseHeight = 3.24;
      detail = -0.74 * Math.pow(side, 1.45) + 0.16 * Math.sin(x * 0.95);
      detail += 0.30 * Math.exp(-((x + 1.2) ** 2) / 3.6);
    } else {
      baseHeight = 2.75;
      detail = 0.30 * Math.sin(x * 0.68) + 0.23 * Math.cos(x * 1.35);
      detail += 0.18 * Math.exp(-((x - 3.2) ** 2) / 5.2);
    }
    const noise = (random() - 0.5) * (type === 'breccia' ? 1.12 : 0.72);
    ridge.push([x, clamp(baseHeight + (detail + noise) * contourStrength, 1.85, 4.08)]);
  }

  const leftTop = ridge[0][1];
  const rightTop = ridge[ridge.length - 1][1];
  const silhouette = [[-8.25, bottomY]];
  for (let index = 1; index <= 5; index += 1) {
    const t = index / 6;
    const y = bottomY + (leftTop - bottomY) * t;
    const x = -8.25 + 0.65 * t + (random() - 0.5) * 0.28 * contourStrength;
    silhouette.push([x, y]);
  }
  silhouette.push(...ridge);
  for (let index = 1; index <= 5; index += 1) {
    const t = index / 6;
    const y = rightTop + (bottomY - rightTop) * t;
    const x = 7.6 + 0.65 * t + (random() - 0.5) * 0.28 * contourStrength;
    silhouette.push([x, y]);
  }
  silhouette.push([8.25, bottomY]);

  const grid = { ...BASE_GRID };
  const frontNodes = [];
  const backNodes = [];
  const stepX = (grid.maxX - grid.minX) / (grid.columns - 1);
  const stepY = (grid.maxY - grid.minY) / (grid.rows - 1);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const x = grid.minX + column * stepX;
      const y = grid.minY + row * stepY;
      let relief;
      if (type === 'layered') {
        relief = 0.22 * Math.sin(x * 0.58) + 0.18 * Math.sin(y * 0.83);
        relief += 0.28 * Math.exp(-((x + 2.4) ** 2 + (y - 0.6) ** 2) / 10);
      } else if (type === 'basalt') {
        relief = 0.24 * Math.sin(x * 0.94) + 0.16 * Math.cos(y * 0.77);
        relief += 0.18 * Math.exp(-((x - 1.0) ** 2 + y ** 2) / 14);
      } else {
        relief = 0.22 * Math.cos(x * 0.77) + 0.19 * Math.sin(y * 0.94);
        relief += 0.20 * Math.exp(-((x + 3.1) ** 2 + (y + 0.2) ** 2) / 12);
      }
      const noise = (random() - 0.5) * (type === 'breccia' ? 0.90 : 0.76);
      const frontZ = clamp(-0.06 + (relief + noise) * reliefStrength, -0.72, 0.98);
      frontNodes.push({ x, y, z: frontZ });
      backNodes.push({ x, y, z: frontZ - 1.58 - random() * 0.40 * reliefStrength });
    }
  }

  return {
    type,
    silhouette,
    ridge,
    grid,
    frontNodes,
    backNodes,
    bottomY,
    parameters: { contour: contourStrength * 100, relief: reliefStrength * 100 },
  };
}

function sampleHeightField(grid, nodes, x, y) {
  const stepX = (grid.maxX - grid.minX) / (grid.columns - 1);
  const stepY = (grid.maxY - grid.minY) / (grid.rows - 1);
  const gx = clamp((x - grid.minX) / stepX, 0, grid.columns - 1 - 1e-9);
  const gy = clamp((y - grid.minY) / stepY, 0, grid.rows - 1 - 1e-9);
  const column = Math.min(grid.columns - 2, Math.floor(gx));
  const row = Math.min(grid.rows - 2, Math.floor(gy));
  const fx = gx - column;
  const fy = gy - row;
  const a = nodes[row * grid.columns + column].z;
  const b = nodes[row * grid.columns + column + 1].z;
  const c = nodes[(row + 1) * grid.columns + column + 1].z;
  const d = nodes[(row + 1) * grid.columns + column].z;
  if ((column + row) % 2 === 0) {
    return fx >= fy
      ? a * (1 - fx) + b * (fx - fy) + c * fy
      : a * (1 - fy) + c * fx + d * (fy - fx);
  }
  return fx + fy <= 1
    ? a * (1 - fx - fy) + b * fx + d * fy
    : b * (1 - fy) + c * (fx + fy - 1) + d * (1 - fx);
}

function signedPolygonDistance(polygon, x, y) {
  let inside = false;
  let minimumSquared = Infinity;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [ax, ay] = polygon[previous];
    const [bx, by] = polygon[index];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    const vx = bx - ax;
    const vy = by - ay;
    const lengthSquared = vx * vx + vy * vy;
    const amount = lengthSquared < 1e-12 ? 0 : clamp(((x - ax) * vx + (y - ay) * vy) / lengthSquared, 0, 1);
    const dx = x - ax - vx * amount;
    const dy = y - ay - vy * amount;
    minimumSquared = Math.min(minimumSquared, dx * dx + dy * dy);
  }
  const distance = Math.sqrt(minimumSquared);
  return inside ? -distance : distance;
}

function cliffBaseSdf(base, x, y, z) {
  const footprint = signedPolygonDistance(base.silhouette, x, y);
  const frontZ = sampleHeightField(base.grid, base.frontNodes, x, y);
  const backZ = sampleHeightField(base.grid, base.backNodes, x, y);
  return Math.max(footprint, z - frontZ, backZ - z);
}

function cliffSurfaceTilt(base, x, y) {
  const step = 0.12;
  const dx = (sampleHeightField(base.grid, base.frontNodes, x + step, y) - sampleHeightField(base.grid, base.frontNodes, x - step, y)) / (2 * step);
  const dy = (sampleHeightField(base.grid, base.frontNodes, x, y + step) - sampleHeightField(base.grid, base.frontNodes, x, y - step)) / (2 * step);
  return [Math.atan(dy), -Math.atan(dx)];
}

function addRockFactory(seed, random, rocks, palette) {
  let id = 0;
  return (shape, center, size, rotation = [0, 0, 0]) => {
    const rockSeed = (seed + ++id * 7919) >>> 0;
    const faces = makeRockPolyhedron(rockSeed, { x: size[0], y: size[1], z: size[2] }, shape);
    const planes = [];
    const vertices = [];
    for (const face of faces) {
      const normal = faceNormal(face.points);
      const offset = dot(normal, face.points[0]);
      const worldNormal = rotate(normal, rotation);
      planes.push({
        normal: worldNormal,
        offset: offset + dot(worldNormal, { x: center[0], y: center[1], z: center[2] }),
      });
      for (const point of face.points) vertices.push(toWorld(point, center, rotation));
    }
    const base = hexColor(palette[Math.floor(random() * palette.length)]);
    const tint = 0.82 + random() * 0.34;
    const color = base.map((channel) => clamp(channel * tint, 0, 1));
    rocks.push({
      id,
      seed: rockSeed,
      shape,
      center: center.slice(),
      size: size.slice(),
      rotation: rotation.slice(),
      planes,
      vertices,
      color,
      bounds: boundsOf(vertices),
    });
  };
}

function chooseWeighted(random, weights) {
  const pairs = Object.entries(weights);
  let value = random() * pairs.reduce((total, [, weight]) => total + weight, 0);
  for (const [shape, weight] of pairs) {
    value -= weight;
    if (value <= 0) return shape;
  }
  return pairs[pairs.length - 1][0];
}

function buildLayeredLayout(addRock, random, density) {
  const widthScale = 1.18 - density * 0.30;
  let y = -3.48;
  while (y < 3.48) {
    const layerHeight = 0.34 + random() * 0.30;
    let x = -7.42 + (random() - 0.5) * 0.12;
    while (x < 7.42) {
      const width = (0.52 + Math.pow(random(), 0.78) * 1.10) * widthScale;
      const shape = chooseWeighted(random, CLIFF_PROFILES.layered.weights);
      const sizeVariation = 0.70 + random() * 0.66;
      const rockHeight = layerHeight * (shape === 'slab' ? 0.54 + random() * 0.22 : 0.72 + random() * 0.28);
      const depth = 0.24 + random() * 0.47;
      addRock(
        shape,
        [x + width * 0.5 + (random() - 0.5) * 0.12, y + layerHeight * 0.5 + (random() - 0.5) * 0.07, 0.27 + random() * 0.20],
        [width * 0.56 * sizeVariation, rockHeight * 0.58 * sizeVariation, depth * (0.72 + random() * 0.58)],
        [(random() - 0.5) * 0.12, (random() - 0.5) * 0.20, (random() - 0.5) * 0.07],
      );
      x += width * (0.78 + random() * 0.13);
    }
    y += layerHeight * (0.78 + random() * 0.13);
  }

  const surfaceCount = 30 + Math.round(density * 42);
  for (let index = 0; index < surfaceCount; index += 1) {
    const shape = chooseWeighted(random, CLIFF_PROFILES.layered.weights);
    const width = 0.20 + random() * 0.38;
    addRock(
      shape,
      [-7.1 + random() * 14.2, -3.20 + random() * 6.48, 0.43 + random() * 0.10],
      [width, 0.15 + random() * 0.25, 0.18 + random() * 0.18],
      [(random() - 0.5) * 0.18, (random() - 0.5) * 0.28, (random() - 0.5) * 0.12],
    );
  }
}

function buildBasaltLayout(addRock, random, density) {
  let x = -7.27;
  while (x < 7.2) {
    const columnWidth = 0.68 + random() * 0.40;
    let y = -3.49;
    while (y < 3.47) {
      const requestedHeight = 0.82 + random() * 1.12;
      const segmentHeight = Math.min(requestedHeight, Math.max(0, (3.68 - y) / 1.22));
      if (segmentHeight < 0.18) break;
      const shape = random() < 0.78 ? 'columnar' : 'blocky';
      addRock(
        shape,
        [x + columnWidth * 0.5 + (random() - 0.5) * 0.09, y + segmentHeight * 0.5, 0.25 + random() * 0.20],
        [columnWidth * 0.48, segmentHeight * 0.56, 0.34 + random() * 0.28],
        [(random() - 0.5) * 0.08, (random() - 0.5) * 0.12, (random() - 0.5) * 0.045],
      );
      y += segmentHeight * (0.82 + random() * 0.10);
    }
    x += columnWidth * (0.83 + random() * 0.12);
  }
  addTalus(addRock, random, 65 + Math.round(density * 0.36), CLIFF_PROFILES.basalt.weights);
}

function buildBrecciaLayout(addRock, random, density) {
  for (let y = -3.52; y < 3.45; y += 0.66) {
    for (let x = -7.28; x < 7.35; x += 0.70) {
      if (random() < 0.11) continue;
      const shape = chooseWeighted(random, CLIFF_PROFILES.breccia.weights);
      const sizeScale = 0.66 + random() * 0.74;
      const width = (0.30 + random() * 0.65) * sizeScale;
      const height = (0.25 + random() * 0.70) * sizeScale;
      addRock(
        shape,
        [x + (random() - 0.5) * 0.34, y + (random() - 0.5) * 0.30, 0.27 + random() * 0.22],
        [width, height, (0.26 + random() * 0.55) * sizeScale],
        [(random() - 0.5) * 0.20, (random() - 0.5) * 0.36, (random() - 0.5) * 0.16],
      );
    }
  }
  addTalus(addRock, random, 100 + Math.round(density * 0.42), CLIFF_PROFILES.breccia.weights);
}

function addTalus(addRock, random, count, weights) {
  for (let index = 0; index < count; index += 1) {
    const x = -8.00 + random() * 16.0;
    const slope = 1 - Math.abs(x) / 8.2;
    const y = -3.34 - random() * 0.86 + slope * 0.20;
    const scale = 0.16 + random() * 0.30;
    const shape = random() < 0.57 ? 'rubble' : chooseWeighted(random, weights);
    addRock(
      shape,
      [x, y, 0.34 + random() * 0.22],
      [scale * (0.85 + random() * 0.7), scale * (0.62 + random() * 0.66), scale * (0.75 + random() * 0.85)],
      [(random() - 0.5) * 0.8, random() * Math.PI, (random() - 0.5) * 0.8],
    );
  }
}

function makeRockCollection(options) {
  const type = CLIFF_PROFILES[options.cliffType] ? options.cliffType : 'layered';
  const profile = CLIFF_PROFILES[type];
  const seed = Number(options.seed ?? 2417);
  const random = seededRandom((seed ^ 0x9e3779b9) >>> 0);
  const density = clamp(Number(options.density ?? 58), 0, 100) / 100;
  const base = makeCliffBase(type, seed, options);
  const rocks = [];
  const addRockRaw = addRockFactory(seed, random, rocks, profile.palette);
  const addRock = (shape, center, size, rotation = [0, 0, 0]) => {
    const edgeDistance = signedPolygonDistance(base.silhouette, center[0], center[1]);
    if (edgeDistance > Math.max(size[0], size[1]) * 1.32) return;
    const frontZ = sampleHeightField(base.grid, base.frontNodes, center[0], center[1]);
    const tilt = cliffSurfaceTilt(base, center[0], center[1]);
    addRockRaw(
      shape,
      [center[0], center[1], frontZ + center[2] - 0.22],
      size,
      [rotation[0] + tilt[0], rotation[1] + tilt[1], rotation[2]],
    );
  };

  if (type === 'layered') buildLayeredLayout(addRock, random, density);
  else if (type === 'basalt') buildBasaltLayout(addRock, random, density);
  else buildBrecciaLayout(addRock, random, density);

  const azimuth = (Number(options.angle ?? -8) * Math.PI) / 180;
  const wander = Number(options.wander ?? 48);
  const crackRate = profile.fractureRate * (0.50 + density * 0.9);
  const grooves = [];
  let crackedRocks = 0;
  for (const rock of rocks) {
    if (random() > crackRate) continue;
    const network = generateFractureNetwork(
      makeRockPolyhedron(rock.seed, { x: rock.size[0], y: rock.size[1], z: rock.size[2] }, rock.shape),
      { seed: rock.seed + 409, density: 0, wander, angle: azimuth * 180 / Math.PI, cutCount: 1, primaryCuts: 1 },
    );
    const event = network.events[0];
    if (!event) continue;
    let added = 0;
    for (const segment of event.surfaceSegments) {
      if (segment.kind !== 'rock') continue;
      const worldNormal = rotate(segment.normal, rock.rotation);
      if (worldNormal.z < 0.10) continue;
      grooves.push({
        a: toWorld(segment.a, rock.center, rock.rotation),
        b: toWorld(segment.b, rock.center, rock.rotation),
        normal: worldNormal,
        rockId: rock.id,
      });
      added += 1;
    }
    if (added) crackedRocks += 1;
  }

  return { type, profile, base, rocks, grooves, crackedRocks, seed };
}

export function cliffTypeInfo(type) {
  const profile = CLIFF_PROFILES[type] ?? CLIFF_PROFILES.layered;
  const mix = Object.entries(profile.weights)
    .map(([name, weight]) => `${Math.round(weight * 100)}% ${name}`)
    .join(' · ');
  return { name: profile.name, description: profile.description, mix };
}

export function buildCliffMesh(options = {}) {
  const collection = makeRockCollection(options);
  const bounds = options.bounds ?? boundsForCollection(collection);
  const resolution = options.resolution ?? { nx: 148, ny: 86, nz: 52 };
  const nx = Math.max(8, Math.round(resolution.nx));
  const ny = Math.max(8, Math.round(resolution.ny));
  const nz = Math.max(8, Math.round(resolution.nz));
  const dx = (bounds.maxX - bounds.minX) / (nx - 1);
  const dy = (bounds.maxY - bounds.minY) / (ny - 1);
  const dz = (bounds.maxZ - bounds.minZ) / (nz - 1);
  const isoScale = Math.min(dx, dy, dz);
  const isoDither = isoScale * 1e-2;
  const isoFloor = isoScale * 1e-2;
  const positions = new Float32Array(nx * ny * nz * 3);
  const values = new Float32Array(nx * ny * nz);
  const colors = new Float32Array(nx * ny * nz * 3);
  const xs = Array.from({ length: nx }, (_, index) => bounds.minX + dx * index);
  const ys = Array.from({ length: ny }, (_, index) => bounds.minY + dy * index);
  const zs = Array.from({ length: nz }, (_, index) => bounds.minZ + dz * index);
  const bucketSize = 0.72;
  const rockBuckets = makeBuckets(collection.rocks, bounds, bucketSize, Math.max(dx, dy, dz) * 1.75, (rock) => rock.bounds);
  const grooveWidth = 0.018 + (clamp(Number(options.opening ?? 32), 0, 100) / 100) * 0.105;
  const grooveBounds = collection.grooves.map((groove) => segmentBounds(groove, grooveWidth));
  const grooveBuckets = makeBuckets(collection.grooves, bounds, bucketSize, Math.max(dx, dy, dz) * 1.5 + grooveWidth, (_, index) => grooveBounds[index]);
  const coreColors = hexColor('#817d73');
  const crackColor = hexColor('#454842');

  for (let k = 0; k < nz; k += 1) {
    const z = zs[k];
    for (let j = 0; j < ny; j += 1) {
      const y = ys[j];
      for (let i = 0; i < nx; i += 1) {
        const x = xs[i];
        const sampleIndex = (k * ny + j) * nx + i;
        const positionIndex = sampleIndex * 3;
        positions[positionIndex] = x;
        positions[positionIndex + 1] = y;
        positions[positionIndex + 2] = z;

        let distance = cliffBaseSdf(collection.base, x, y, z);
        let colorR = coreColors[0];
        let colorG = coreColors[1];
        let colorB = coreColors[2];

        const key = bucketKey(Math.floor((x - bounds.minX) / bucketSize), Math.floor((y - bounds.minY) / bucketSize), Math.floor((z - bounds.minZ) / bucketSize));
        const rockCandidates = rockBuckets.get(key) ?? [];
        for (const rockIndex of rockCandidates) {
          const rock = collection.rocks[rockIndex];
          const rockDistance = convexPolySdf(rock.planes, x, y, z);
          if (rockDistance < distance) {
            distance = rockDistance;
            colorR = rock.color[0];
            colorG = rock.color[1];
            colorB = rock.color[2];
          }
        }

        if (grooveWidth > 0) {
          const grooveCandidates = grooveBuckets.get(key) ?? [];
          for (const grooveIndex of grooveCandidates) {
            const groove = collection.grooves[grooveIndex];
            const cavity = grooveWidth - pointSegmentDistance(x, y, z, groove.a, groove.b);
            if (cavity > distance) {
              distance = cavity;
              colorR = crackColor[0];
              colorG = crackColor[1];
              colorB = crackColor[2];
            }
          }
        }

        const isoValue = distance + stableDither(sampleIndex, isoDither);
        values[sampleIndex] = Math.abs(isoValue) < isoFloor
          ? (isoValue < 0 ? -isoFloor : isoFloor)
          : isoValue;
        colors[positionIndex] = colorR;
        colors[positionIndex + 1] = colorG;
        colors[positionIndex + 2] = colorB;
      }
    }
  }

  applyCurvatureOcclusion(colors, values, nx, ny, nz, dx, dy, dz, ys);

  const outputPositions = [];
  const outputNormals = [];
  const outputColors = [];
  const cubeOffsets = CORNERS.map(([x, y, z]) => z * nx * ny + y * nx + x);
  const cornerValues = new Float32Array(8);
  const cornerIndices = new Int32Array(8);

  for (let k = 0; k < nz - 1; k += 1) {
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const base = (k * ny + j) * nx + i;
        let hasInside = false;
        let hasOutside = false;
        for (let corner = 0; corner < 8; corner += 1) {
          const index = base + cubeOffsets[corner];
          cornerIndices[corner] = index;
          cornerValues[corner] = values[index];
          if (cornerValues[corner] < 0) hasInside = true;
          else hasOutside = true;
        }
        if (!hasInside || !hasOutside) continue;

        for (const tetra of TETRAHEDRA) {
          polygonizeTetra(
            tetra.map((corner) => cornerIndices[corner]),
            values,
            positions,
            colors,
            outputPositions,
            outputNormals,
            outputColors,
          );
        }
      }
    }
  }

  const mesh = {
    positions: new Float32Array(outputPositions),
    normals: new Float32Array(outputNormals),
    colors: new Float32Array(outputColors),
    vertexCount: outputPositions.length / 3,
    triangleCount: outputPositions.length / 9,
    closed: true,
  };

  return {
    ...collection,
    mesh,
    grooveWidth,
    material: { shading: 'height-weathering + SDF curvature/AO + structured procedural stamps', crackTexture: false },
    grid: { nx, ny, nz, spacing: [round(dx), round(dy), round(dz)], bounds },
    summary: {
      rockCount: collection.rocks.length,
      crackedRocks: collection.crackedRocks,
      jointTraces: collection.grooves.length,
      triangleCount: mesh.triangleCount,
      watertight: mesh.closed,
    },
    recipe: collection.rocks.map(({ seed, shape, center, size, rotation, color }) => ({ seed, shape, center, size, rotation, color })),
  };
}

function applyCurvatureOcclusion(colors, values, nx, ny, nz, dx, dy, dz, ys) {
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const strideY = nx;
  const strideZ = nx * ny;
  const surfaceBand = Math.max(dx, dy, dz) * 1.7;

  for (let k = 3; k < nz - 3; k += 1) {
    for (let j = 3; j < ny - 3; j += 1) {
      for (let i = 3; i < nx - 3; i += 1) {
        const index = (k * ny + j) * nx + i;
        const center = values[index];
        if (Math.abs(center) > surfaceBand) continue;
        const gx = (values[index + 1] - values[index - 1]) / (2 * dx);
        const gy = (values[index + strideY] - values[index - strideY]) / (2 * dy);
        const gz = (values[index + strideZ] - values[index - strideZ]) / (2 * dz);
        const gradientLength = Math.hypot(gx, gy, gz) || 1;
        const normal = { x: gx / gradientLength, y: gy / gradientLength, z: gz / gradientLength };
        const curvature =
          (values[index + 1] - 2 * center + values[index - 1]) / (dx * dx) +
          (values[index + strideY] - 2 * center + values[index - strideY]) / (dy * dy) +
          (values[index + strideZ] - 2 * center + values[index - strideZ]) / (dz * dz);
        const concavity = clamp(-curvature * 0.20, 0, 1);
        const convexity = clamp(curvature * 0.10, 0, 1);
        let blockedHorizon = 0;
        for (const direction of directions) {
          const facing = normal.x * direction[0] + normal.y * direction[1] + normal.z * direction[2];
          if (facing < 0.32) continue;
          for (const step of [1, 2, 3]) {
            const probe = index + direction[0] * step + direction[1] * strideY * step + direction[2] * strideZ * step;
            if (values[probe] < 0) {
              blockedHorizon += facing * (1 / step);
              break;
            }
          }
        }
        const occlusion = clamp(blockedHorizon * 0.035, 0, 0.20);
        const height = clamp((ys[j] + 4.55) / 8.4, 0, 1);
        const groundContact = 1 - smoothstep(0.05, 0.48, height);
        const ao = 1 - concavity * 0.15 - occlusion - groundContact * 0.045;
        const factor = clamp((0.87 + height * 0.14 + convexity * 0.045) * ao, 0.68, 1.08);
        const colorIndex = index * 3;
        colors[colorIndex] = clamp(colors[colorIndex] * factor, 0, 1);
        colors[colorIndex + 1] = clamp(colors[colorIndex + 1] * factor, 0, 1);
        colors[colorIndex + 2] = clamp(colors[colorIndex + 2] * factor, 0, 1);
      }
    }
  }
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function polygonizeTetra(indices, values, positions, colors, outputPositions, outputNormals, outputColors) {
  const inside = [];
  const outside = [];
  for (const index of indices) {
    if (values[index] < 0) inside.push(index);
    else outside.push(index);
  }
  if (inside.length === 0 || inside.length === 4) return;

  let gradient;
  if (inside.length === 1) {
    gradient = subtract(centroidOf(outside, positions), pointAt(inside[0], positions));
    const a = interpolateEdge(inside[0], outside[0], values, positions, colors);
    const b = interpolateEdge(inside[0], outside[1], values, positions, colors);
    const c = interpolateEdge(inside[0], outside[2], values, positions, colors);
    appendTriangle(a, b, c, gradient, outputPositions, outputNormals, outputColors);
    return;
  }

  if (inside.length === 3) {
    gradient = subtract(pointAt(outside[0], positions), centroidOf(inside, positions));
    const a = interpolateEdge(outside[0], inside[0], values, positions, colors);
    const b = interpolateEdge(outside[0], inside[1], values, positions, colors);
    const c = interpolateEdge(outside[0], inside[2], values, positions, colors);
    appendTriangle(a, b, c, gradient, outputPositions, outputNormals, outputColors);
    return;
  }

  gradient = subtract(centroidOf(outside, positions), centroidOf(inside, positions));
  const a = interpolateEdge(inside[0], outside[0], values, positions, colors);
  const b = interpolateEdge(inside[0], outside[1], values, positions, colors);
  const c = interpolateEdge(inside[1], outside[1], values, positions, colors);
  const d = interpolateEdge(inside[1], outside[0], values, positions, colors);
  appendTriangle(a, b, c, gradient, outputPositions, outputNormals, outputColors);
  appendTriangle(a, c, d, gradient, outputPositions, outputNormals, outputColors);
}

function interpolateEdge(a, b, values, positions, colors) {
  const denominator = values[a] - values[b];
  const amount = Math.abs(denominator) < 1e-12 ? 0.5 : clamp(values[a] / denominator, 0, 1);
  const ai = a * 3;
  const bi = b * 3;
  return {
    x: positions[ai] + (positions[bi] - positions[ai]) * amount,
    y: positions[ai + 1] + (positions[bi + 1] - positions[ai + 1]) * amount,
    z: positions[ai + 2] + (positions[bi + 2] - positions[ai + 2]) * amount,
    r: colors[ai] + (colors[bi] - colors[ai]) * amount,
    g: colors[ai + 1] + (colors[bi + 1] - colors[ai + 1]) * amount,
    b: colors[ai + 2] + (colors[bi + 2] - colors[ai + 2]) * amount,
  };
}

function appendTriangle(a, b, c, gradient, positions, normals, colors) {
  let ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  let ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  let normal = cross(ab, ac);
  if (dot(normal, gradient) < 0) {
    [b, c] = [c, b];
    ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    normal = cross(ab, ac);
  }
  const magnitude = Math.hypot(normal.x, normal.y, normal.z);
  if (magnitude < 1e-10) return;
  normal = { x: normal.x / magnitude, y: normal.y / magnitude, z: normal.z / magnitude };
  for (const vertex of [a, b, c]) {
    positions.push(vertex.x, vertex.y, vertex.z);
    normals.push(normal.x, normal.y, normal.z);
    colors.push(vertex.r, vertex.g, vertex.b);
  }
}

function pointAt(index, positions) {
  const offset = index * 3;
  return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
}

function centroidOf(indices, positions) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const index of indices) {
    const offset = index * 3;
    x += positions[offset];
    y += positions[offset + 1];
    z += positions[offset + 2];
  }
  const inverse = 1 / indices.length;
  return { x: x * inverse, y: y * inverse, z: z * inverse };
}

function convexPolySdf(planes, x, y, z) {
  let distance = -Infinity;
  for (const plane of planes) {
    distance = Math.max(distance, plane.normal.x * x + plane.normal.y * y + plane.normal.z * z - plane.offset);
  }
  return distance;
}

function pointSegmentDistance(x, y, z, start, end) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const vz = end.z - start.z;
  const lengthSquared = vx * vx + vy * vy + vz * vz;
  const amount = lengthSquared < 1e-12
    ? 0
    : clamp(((x - start.x) * vx + (y - start.y) * vy + (z - start.z) * vz) / lengthSquared, 0, 1);
  return Math.hypot(x - start.x - vx * amount, y - start.y - vy * amount, z - start.z - vz * amount);
}

function makeBuckets(items, bounds, bucketSize, margin, getBounds) {
  const buckets = new Map();
  for (let index = 0; index < items.length; index += 1) {
    const box = getBounds(items[index], index);
    const minX = Math.floor((box.minX - margin - bounds.minX) / bucketSize);
    const maxX = Math.floor((box.maxX + margin - bounds.minX) / bucketSize);
    const minY = Math.floor((box.minY - margin - bounds.minY) / bucketSize);
    const maxY = Math.floor((box.maxY + margin - bounds.minY) / bucketSize);
    const minZ = Math.floor((box.minZ - margin - bounds.minZ) / bucketSize);
    const maxZ = Math.floor((box.maxZ + margin - bounds.minZ) / bucketSize);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = bucketKey(x, y, z);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(index);
        }
      }
    }
  }
  return buckets;
}

function bucketKey(x, y, z) { return `${x}|${y}|${z}`; }

function stableDither(index, amplitude) {
  let hash = Math.imul(index ^ (index >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 4294967296 - 0.5) * amplitude;
}

function segmentBounds(segment, margin) {
  return {
    minX: Math.min(segment.a.x, segment.b.x) - margin,
    minY: Math.min(segment.a.y, segment.b.y) - margin,
    minZ: Math.min(segment.a.z, segment.b.z) - margin,
    maxX: Math.max(segment.a.x, segment.b.x) + margin,
    maxY: Math.max(segment.a.y, segment.b.y) + margin,
    maxZ: Math.max(segment.a.z, segment.b.z) + margin,
  };
}

function boundsForCollection(collection) {
  const bounds = { ...DEFAULT_BOUNDS };
  const margin = 0.22;
  for (const rock of collection.rocks) {
    bounds.minX = Math.min(bounds.minX, rock.bounds.minX - margin);
    bounds.minY = Math.min(bounds.minY, rock.bounds.minY - margin);
    bounds.minZ = Math.min(bounds.minZ, rock.bounds.minZ - margin);
    bounds.maxX = Math.max(bounds.maxX, rock.bounds.maxX + margin);
    bounds.maxY = Math.max(bounds.maxY, rock.bounds.maxY + margin);
    bounds.maxZ = Math.max(bounds.maxZ, rock.bounds.maxZ + margin);
  }
  for (const point of collection.base.silhouette) {
    bounds.minX = Math.min(bounds.minX, point[0] - margin);
    bounds.maxX = Math.max(bounds.maxX, point[0] + margin);
    bounds.minY = Math.min(bounds.minY, point[1] - margin);
    bounds.maxY = Math.max(bounds.maxY, point[1] + margin);
  }
  for (const node of [...collection.base.frontNodes, ...collection.base.backNodes]) {
    bounds.minZ = Math.min(bounds.minZ, node.z - margin);
    bounds.maxZ = Math.max(bounds.maxZ, node.z + margin);
  }
  return bounds;
}

function boundsOf(points) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function faceNormal(points) {
  const a = points[0];
  const b = points[1];
  const c = points[2];
  return normalize(cross(subtract(b, a), subtract(c, a)));
}

function toWorld(point, center, rotation) {
  const transformed = rotate(point, rotation);
  return { x: transformed.x + center[0], y: transformed.y + center[1], z: transformed.z + center[2] };
}

function rotate(point, rotation) {
  const [rx, ry, rz] = rotation;
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x1 = cz * point.x - sz * point.y;
  const y1 = sz * point.x + cz * point.y;
  const z1 = point.z;
  const x2 = x1;
  const y2 = cx * y1 - sx * z1;
  const z2 = sx * y1 + cx * z1;
  return { x: cy * x2 + sy * z2, y: y2, z: -sy * x2 + cy * z2 };
}

function normalize(value) {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function hexColor(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
function round(value) { return Number(value.toFixed(3)); }
