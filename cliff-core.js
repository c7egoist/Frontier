import {
  buildSealedRockMesh,
  clamp,
  generateFractureNetwork,
  makeRockPolyhedron,
  seededRandom,
} from './fracture-core.js';

/**
 * Multi-band satellite-derived geological color ramps (SatMaps).
 * Each SatMap has 16 finely graded outcrop stops from deep crevice/varnish shadow (0.0)
 * through stratified bedrock bands to sunlit weathered caprock highlights (1.0).
 */
export const SATMAP_PRESETS = {
  sandstone: {
    name: 'Utah Navajo Sandstone SatMap',
    subtitle: 'Warm canyon ochre, iron-oxide strata bands, and dark manganese crevice varnish',
    stops: [
      '#2b231f', '#3c2e27', '#523b2f', '#6b4938',
      '#825840', '#96684b', '#a87856', '#b78963',
      '#9e785c', '#b08b6a', '#c29c76', '#cca982',
      '#b89878', '#cab090', '#dac3a4', '#e6d4b8',
    ],
  },
  limestone: {
    name: 'Alpine Dolomite & Karst SatMap',
    subtitle: 'Cool karst limestone, warm dolomitic beds, ash-grey benches, and charcoal fissures',
    stops: [
      '#232728', '#313638', '#424849', '#555b5b',
      '#686e6c', '#7a7f7a', '#8c9088', '#9ea096',
      '#878a82', '#9a9c92', '#aeb0a4', '#bfc0b4',
      '#b0b2a8', '#c4c5ba', '#d5d5ca', '#e4e3d8',
    ],
  },
  basalt: {
    name: 'Icelandic Columnar Basalt SatMap',
    subtitle: 'Magnetite charcoal columns, blue-slate prism faces, and oxidized rust joint seams',
    stops: [
      '#1a1e21', '#242a2e', '#30383d', '#3e474d',
      '#57463c', '#4c565c', '#5b656b', '#6a7479',
      '#786454', '#6d777b', '#7d878a', '#8d9698',
      '#83796d', '#949c9c', '#a6aeac', '#b9bfbc',
    ],
  },
  granite: {
    name: 'Sierra Crag & Breccia SatMap',
    subtitle: 'Biotite dark fractures, feldspar warm grey, quartz buff, and weathered alpine highlights',
    stops: [
      '#222321', '#31322e', '#43433d', '#57554d',
      '#6b675c', '#7c7669', '#8c8577', '#9c9484',
      '#837e72', '#958f82', '#a7a091', '#b7af9f',
      '#a8a296', '#bab4a6', '#ccc5b7', '#ddd6c8',
    ],
  },
  canyon: {
    name: 'Redbed Gorge & Ironstone SatMap',
    subtitle: 'Deep hematitic redbeds, vermilion shale partings, sienna ledges, and buff caprock',
    stops: [
      '#281b19', '#3b2420', '#543028', '#6e3c30',
      '#874a39', '#9e5942', '#b36a4d', '#c47c5a',
      '#9c5d47', '#b27156', '#c68565', '#d49975',
      '#c08b6d', '#d1a382', '#dfc8a9', '#ecdac0',
    ],
  },
};

const CLIFF_PROFILES = {
  layered: {
    name: 'Layered sedimentary escarpment',
    description: 'Pronounced S-curved sandstone headland with cantilevered slab overhangs, stepped strata ledges, fractured cliff blocks, and a cascading talus boulder apron.',
    weights: { slab: 0.46, blocky: 0.34, jagged: 0.14, rubble: 0.06 },
    defaultSatmap: 'sandstone',
    palette: ['#8b735b', '#a6896b', '#75604c', '#bfa182', '#947b62'],
    fractureRate: 0.68,
  },
  basalt: {
    name: 'Columnar basalt face',
    description: 'Stepped colonnade promontories of 5–7 sided polygonal basalt columns with cross-jointed drums, fractured entablature caprock, and toppled column talus.',
    weights: { columnar: 0.62, blocky: 0.20, slab: 0.08, rubble: 0.10 },
    defaultSatmap: 'basalt',
    palette: ['#525c61', '#677176', '#40494e', '#7c8588', '#736152'],
    fractureRate: 0.72,
  },
  breccia: {
    name: 'Breccia / crag spire & talus cliff',
    description: 'Towering craggy spires, deeply recessed couloir gullies, heavily fractured angular rock buttresses, and a massive cascading boulder talus cone.',
    weights: { jagged: 0.42, spire: 0.24, blocky: 0.16, rubble: 0.18 },
    defaultSatmap: 'granite',
    palette: ['#787266', '#8f8779', '#615d54', '#a69d8d', '#b8afa0'],
    fractureRate: 0.74,
  },
};

const BASE_GRID = { minX: -8.88, minY: -5.12, maxX: 8.88, maxY: 4.88, columns: 11, rows: 7 };
const DEFAULT_BOUNDS = { minX: -9.2, minY: -5.2, minZ: -3.2, maxX: 9.2, maxY: 5.2, maxZ: 3.6 };

export function sampleSatMap(satmapKey, t) {
  const preset = SATMAP_PRESETS[satmapKey] ?? SATMAP_PRESETS.sandstone;
  const stops = preset.stops;
  const clamped = clamp(t, 0, 1);
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  const c0 = hexColor(stops[index]);
  const c1 = hexColor(stops[index + 1]);
  return [
    c0[0] + (c1[0] - c0[0]) * frac,
    c0[1] + (c1[1] - c0[1]) * frac,
    c0[2] + (c1[2] - c0[2]) * frac,
  ];
}

export function satmapInfo(satmapKey, cliffType = 'layered') {
  const resolvedKey = satmapKey && satmapKey !== 'auto' && SATMAP_PRESETS[satmapKey]
    ? satmapKey
    : (CLIFF_PROFILES[cliffType]?.defaultSatmap ?? 'sandstone');
  const preset = SATMAP_PRESETS[resolvedKey] ?? SATMAP_PRESETS.sandstone;
  return {
    id: resolvedKey,
    name: preset.name,
    subtitle: preset.subtitle,
    stops: preset.stops.slice(),
  };
}

function makeCliffBase(type, seed, options = {}) {
  const random = seededRandom((Number(seed) ^ 0x6a09e667) >>> 0);
  const contourStrength = clamp(Number(options.cliffContour ?? 78), 0, 100) / 100;
  const reliefStrength = clamp(Number(options.cliffRelief ?? 62), 0, 100) / 100;
  const bottomY = -4.55;
  const ridge = [];
  const ridgeCount = 15;
  const phaseShift = (random() - 0.5) * 1.4;

  for (let index = 0; index < ridgeCount; index += 1) {
    const x = -7.8 + (15.6 * index) / (ridgeCount - 1);
    const side = Math.abs(x) / 7.8;
    let baseHeight;
    let detail;
    if (type === 'layered') {
      baseHeight = 2.95;
      // Bold asymmetric headland, stepped mesa bench, and deep canyon notch
      detail = 1.25 * Math.sin(x * 0.44 + phaseShift * 0.35) + 0.68 * Math.cos(x * 0.96 - 0.4);
      detail += 1.65 * Math.exp(-((x + 2.6) ** 2) / 5.2) - 1.78 * Math.exp(-((x - 2.15) ** 2) / 2.2);
      detail += 0.88 * Math.exp(-((x - 5.1) ** 2) / 3.4) - 0.65 * Math.pow(side, 2.2);
    } else if (type === 'basalt') {
      baseHeight = 3.10;
      // Stepped organ-pipe promontory crown with dramatic terraced flanks
      const stepTerrace = Math.round(Math.sin(x * 0.48 + phaseShift * 0.35) * 2.5) * 0.52;
      detail = -1.75 * Math.pow(side, 1.55) + stepTerrace + 0.54 * Math.cos(x * 1.05);
      detail += 1.35 * Math.exp(-((x + 0.9) ** 2) / 4.2) - 1.05 * Math.exp(-((x - 3.1) ** 2) / 2.4);
    } else {
      baseHeight = 2.75;
      // Towering alpine crag spires separated by deep couloir chutes
      detail = 1.35 * Math.sin(x * 0.64 + phaseShift * 0.35) + 0.92 * Math.cos(x * 1.38);
      detail += 1.68 * Math.exp(-((x + 3.2) ** 2) / 2.1) + 1.52 * Math.exp(-((x - 2.4) ** 2) / 2.4);
      detail -= 1.62 * Math.exp(-((x - 0.2) ** 2) / 1.8);
    }
    const noise = (random() - 0.5) * (type === 'breccia' ? 1.55 : 1.05);
    ridge.push([x, clamp(baseHeight + (detail + noise) * contourStrength, 0.65, 4.75)]);
  }

  const leftTop = ridge[0][1];
  const rightTop = ridge[ridge.length - 1][1];
  const silhouette = [[-8.45, bottomY]];
  for (let index = 1; index <= 5; index += 1) {
    const t = index / 6;
    const y = bottomY + (leftTop - bottomY) * t;
    const x = -8.45 + 0.65 * t + (random() - 0.5) * 0.58 * contourStrength;
    silhouette.push([x, y]);
  }
  silhouette.push(...ridge);
  for (let index = 1; index <= 5; index += 1) {
    const t = index / 6;
    const y = rightTop + (bottomY - rightTop) * t;
    const x = 7.8 + 0.65 * t + (random() - 0.5) * 0.58 * contourStrength;
    silhouette.push([x, y]);
  }
  silhouette.push([8.45, bottomY]);

  const grid = { ...BASE_GRID };
  const frontNodes = [];
  const backNodes = [];
  const stepX = (grid.maxX - grid.minX) / (grid.columns - 1);
  const stepY = (grid.maxY - grid.minY) / (grid.rows - 1);

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const x = grid.minX + column * stepX;
      const y = grid.minY + row * stepY;
      // Pronounced 3D macro-architecture: bold protruding buttresses, deep recessed coves, and upper overhangs
      const headlandSweep = 1.15 * Math.sin(x * 0.38 + phaseShift) + 0.62 * Math.cos(x * 0.82 - 0.5);
      const buttressLeft = 1.25 * Math.exp(-((x + 2.8) ** 2) / 5.2);
      const gullyCenter = -1.35 * Math.exp(-((x - 1.6) ** 2) / 3.4);
      const buttressRight = 0.95 * Math.exp(-((x - 4.8) ** 2) / 4.2);

      // Vertical profile: projecting talus toe at bottom, undercut mid-wall, overhanging cornice near top
      const heightNorm = clamp((y - bottomY) / 8.8, 0, 1);
      const overhangProfile =
        0.75 * Math.exp(-((heightNorm - 0.82) ** 2) / 0.035) -
        0.55 * Math.exp(-((heightNorm - 0.46) ** 2) / 0.045) +
        0.48 * Math.exp(-((heightNorm - 0.08) ** 2) / 0.025);

      let relief;
      if (type === 'layered') {
        const strataBench = 0.42 * Math.sin(y * 2.15 + 0.35 * Math.sin(x * 0.5));
        relief = headlandSweep + buttressLeft + gullyCenter + buttressRight + overhangProfile + strataBench;
      } else if (type === 'basalt') {
        const columnRibs = 0.52 * Math.cos(x * 1.45) + 0.34 * Math.sin(y * 1.25);
        relief = headlandSweep * 1.1 + buttressLeft * 0.9 + gullyCenter * 1.1 + overhangProfile * 0.85 + columnRibs;
      } else {
        const cragRibs = 0.68 * Math.sin(x * 1.12 + y * 0.32) + 0.45 * Math.cos(y * 1.42);
        relief = headlandSweep * 1.15 + buttressLeft * 1.2 + gullyCenter * 1.25 + buttressRight + overhangProfile + cragRibs;
      }

      const noise = (random() - 0.5) * (type === 'breccia' ? 1.15 : 0.85);
      const frontZ = clamp(-0.08 + (relief + noise) * reliefStrength, -2.15, 2.45);
      const backZ = frontZ - 1.85 - (0.35 + random() * 0.55) * reliefStrength;
      frontNodes.push({ x, y, z: frontZ });
      backNodes.push({ x, y, z: backZ });
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

function sampleRidgeHeight(ridge, x) {
  if (!ridge.length) return 3.0;
  if (x <= ridge[0][0]) return ridge[0][1];
  if (x >= ridge[ridge.length - 1][0]) return ridge[ridge.length - 1][1];
  for (let i = 0; i < ridge.length - 1; i += 1) {
    const [x0, y0] = ridge[i];
    const [x1, y1] = ridge[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / Math.max(1e-6, x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return ridge[ridge.length - 1][1];
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

function cliffSurfaceTilt(base, x, y) {
  const step = 0.16;
  const dx = (sampleHeightField(base.grid, base.frontNodes, x + step, y) - sampleHeightField(base.grid, base.frontNodes, x - step, y)) / (2 * step);
  const dy = (sampleHeightField(base.grid, base.frontNodes, x, y + step) - sampleHeightField(base.grid, base.frontNodes, x, y - step)) / (2 * step);
  return [clamp(Math.atan(dy) * 0.45, -0.42, 0.42), clamp(-Math.atan(dx) * 0.55, -0.58, 0.58)];
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

function computeSatMapColorForPoint(satmapKey, x, y, z, normal, rock, faceKind, reliefDepth) {
  // 3D domain-warped geological strata coordinate
  const warp =
    0.42 * Math.sin(x * 0.46 + z * 0.72) +
    0.24 * Math.cos(x * 1.12 - y * 0.68) +
    0.14 * Math.sin(y * 2.4 + x * 0.35);
  const heightNorm = clamp((y + 4.6) / 9.1, 0, 1);
  const strataWave = 0.5 + 0.5 * Math.sin((y + warp) * 2.65);

  // Combine height, undulating strata beds, rock mineral bias, and surface slope
  const rockBias = ((rock?.satmapBias ?? 0.5) - 0.5) * 0.24;
  const slopeBoost = clamp(normal.y, -0.6, 0.85) * 0.11;
  const depthTint = clamp(reliefDepth * 0.08, -0.10, 0.12);

  if (faceKind === 'fracture') {
    // Interior 3D crack walls and fissure floors sample deep, freshly cleaved / iron-stained stops
    const crackT = clamp(0.06 + 0.22 * heightNorm + 0.10 * strataWave + rockBias * 0.4, 0.02, 0.36);
    const crackBase = sampleSatMap(satmapKey, crackT);
    const creviceShade = 0.54 + 0.14 * Math.max(0, normal.z);
    return crackBase.map((c) => clamp(c * creviceShade, 0.04, 1));
  }

  const t = clamp(0.18 + 0.46 * heightNorm + 0.26 * strataWave + rockBias + slopeBoost + depthTint, 0.05, 0.98);
  const primary = sampleSatMap(satmapKey, t);

  // Blend in secondary crevice/weathering SatMap stop in concave pockets and lower talus
  const secondaryT = clamp(t - 0.22 + 0.15 * Math.cos(x * 0.9 + y * 1.4), 0.02, 0.95);
  const secondary = sampleSatMap(satmapKey, secondaryT);
  const blendMask = clamp(0.25 + 0.35 * (1 - heightNorm) - 0.20 * normal.y, 0.08, 0.65);

  return [
    clamp(primary[0] * (1 - blendMask) + secondary[0] * blendMask, 0, 1),
    clamp(primary[1] * (1 - blendMask) + secondary[1] * blendMask, 0, 1),
    clamp(primary[2] * (1 - blendMask) + secondary[2] * blendMask, 0, 1),
  ];
}

function addRockFactory(seed, random, rocks, satmapKey, fractureOptions) {
  let id = 0;
  return (shape, center, size, rotation = [0, 0, 0], tier = 'wall') => {
    const rockSeed = (seed + ++id * 7919) >>> 0;
    const outlineFaces = makeRockPolyhedron(rockSeed, { x: size[0], y: size[1], z: size[2] }, shape);

    // Determine whether this rock gets 3D polygon fractures from generateFractureNetwork
    const volumeScore = size[0] * size[1] * size[2];
    const crackChance = tier === 'talus-small'
      ? fractureOptions.crackRate * 0.35
      : tier === 'slab-ledge'
        ? fractureOptions.crackRate * 0.85
        : fractureOptions.crackRate * 1.15;

    let network = null;
    let sealedFaces = outlineFaces;
    let isCracked = false;

    if (random() < crackChance && volumeScore > 0.055) {
      const requestedCuts = volumeScore > 0.48 ? 2 : 1;
      const localAngle = fractureOptions.angleDeg + ((id % 5) - 2) * 6;
      network = generateFractureNetwork(outlineFaces, {
        seed: (rockSeed + 409) >>> 0,
        density: fractureOptions.density,
        wander: fractureOptions.wander,
        angle: localAngle,
        cutCount: requestedCuts,
        primaryCuts: 1,
      });

      if (network.events.length > 0) {
        isCracked = true;
        const maxExtent = Math.max(size[0], size[1], size[2]);
        const rockGap = maxExtent * (0.016 + fractureOptions.openingNorm * 0.058);
        sealedFaces = buildSealedRockMesh(network.finalPieces, {
          gapDistance: rockGap,
          grooveInset: 0.28,
        });
      }
    }

    const satmapBias = random();
    const baseColor = computeSatMapColorForPoint(
      satmapKey,
      center[0],
      center[1],
      center[2],
      { x: 0, y: 0.25, z: 0.96 },
      { satmapBias },
      'rock',
      center[2],
    );

    const planes = [];
    const worldVertices = [];
    for (const face of outlineFaces) {
      const normal = faceNormal(face.points);
      const offset = dot(normal, face.points[0]);
      const worldNormal = rotate(normal, rotation);
      planes.push({
        normal: worldNormal,
        offset: offset + dot(worldNormal, { x: center[0], y: center[1], z: center[2] }),
      });
      for (const point of face.points) worldVertices.push(toWorld(point, center, rotation));
    }

    rocks.push({
      id,
      seed: rockSeed,
      shape,
      tier,
      center: center.slice(),
      size: size.slice(),
      rotation: rotation.slice(),
      planes,
      vertices: worldVertices,
      outlineFaces,
      sealedFaces,
      network,
      isCracked,
      satmapBias,
      color: baseColor,
      bounds: boundsOf(worldVertices),
    });
  };
}

function buildLayeredLayout(addRock, random, density, base) {
  const widthScale = 1.28 - density * 0.22;
  // 1. Stratified main courses of blocky sandstone masses and sharp horizontal slabs
  let y = -3.45;
  let courseIndex = 0;
  while (y < 3.85) {
    const isSlabHorizon = courseIndex % 2 === 1 || random() < 0.38;
    const layerHeight = isSlabHorizon ? (0.42 + random() * 0.30) : (0.72 + random() * 0.54);
    let x = -7.65 + (random() - 0.5) * 0.22;

    while (x < 7.65) {
      const ridgeTop = sampleRidgeHeight(base.ridge, x);
      const strataWaveY = 0.32 * Math.sin(x * 0.45 + courseIndex * 0.7) + 0.16 * Math.cos(x * 1.15);
      const localY = y + layerHeight * 0.5 + strataWaveY;

      if (localY > ridgeTop + 0.22) {
        x += 1.05;
        continue;
      }

      const shape = isSlabHorizon
        ? (random() < 0.76 ? 'slab' : 'blocky')
        : chooseWeighted(random, CLIFF_PROFILES.layered.weights);

      const width = (shape === 'slab' ? (1.05 + random() * 1.55) : (0.82 + Math.pow(random(), 0.75) * 1.48)) * widthScale;
      const sizeVariation = 0.80 + random() * 0.58;
      const rockHeight = shape === 'slab'
        ? layerHeight * (0.48 + random() * 0.34)
        : layerHeight * (0.78 + random() * 0.42);
      const depth = shape === 'slab'
        ? (0.68 + random() * 0.82)
        : (0.54 + random() * 0.72);

      // Cantilever slabs further forward in Z to create pronounced ledges & overhangs (like Screenshot 1750)
      const zProtrude = shape === 'slab'
        ? (0.46 + random() * 0.58)
        : (0.26 + random() * 0.40);

      addRock(
        shape,
        [
          x + width * 0.5 + (random() - 0.5) * 0.16,
          localY + (random() - 0.5) * 0.08,
          zProtrude,
        ],
        [
          width * 0.58 * sizeVariation,
          rockHeight * 0.62 * sizeVariation,
          depth * (0.78 + random() * 0.48),
        ],
        [
          (random() - 0.5) * (shape === 'slab' ? 0.09 : 0.18),
          (random() - 0.5) * 0.28,
          (random() - 0.5) * (shape === 'slab' ? 0.07 : 0.14),
        ],
        shape === 'slab' ? 'slab-ledge' : 'wall',
      );
      x += width * (0.76 + random() * 0.18);
    }
    y += layerHeight * (0.78 + random() * 0.14);
    courseIndex += 1;
  }

  // 2. Pronounced cantilevered overhang slab shelves & buttress outcrops
  const shelfCount = 18 + Math.round(density * 22);
  for (let i = 0; i < shelfCount; i += 1) {
    const x = -7.3 + random() * 14.6;
    const ridgeTop = sampleRidgeHeight(base.ridge, x);
    const yPos = -2.6 + random() * Math.max(1.5, ridgeTop + 2.4);
    if (yPos > ridgeTop + 0.1) continue;
    const isShelf = random() < 0.68;
    const shape = isShelf ? 'slab' : (random() < 0.6 ? 'blocky' : 'jagged');
    const width = isShelf ? (0.82 + random() * 1.35) : (0.52 + random() * 0.88);
    const height = isShelf ? (0.15 + random() * 0.24) : (0.38 + random() * 0.58);
    const depth = isShelf ? (0.72 + random() * 0.82) : (0.48 + random() * 0.58);
    addRock(
      shape,
      [x, yPos, isShelf ? (0.62 + random() * 0.58) : (0.46 + random() * 0.42)],
      [width, height, depth],
      [(random() - 0.5) * 0.12, (random() - 0.5) * 0.36, (random() - 0.5) * 0.10],
      'slab-ledge',
    );
  }

  // 3. Rich cascading talus boulder & rubble apron at the cliff toe (like Screenshot 1748 & 1749)
  addTalusApron(addRock, random, 48 + Math.round(density * 32), CLIFF_PROFILES.layered.weights, base);
}

function buildBasaltLayout(addRock, random, density, base) {
  let x = -7.55;
  while (x < 7.55) {
    const columnWidth = 0.72 + random() * 0.48;
    const ridgeTop = sampleRidgeHeight(base.ridge, x);
    const promontoryPush = 0.38 * Math.cos(x * 0.88) + (random() - 0.5) * 0.26;
    let y = -3.45;
    while (y < ridgeTop - 0.15) {
      const requestedHeight = 0.92 + random() * 1.35;
      const segmentHeight = Math.min(requestedHeight, Math.max(0.28, ridgeTop - y));
      const isCaprock = y + segmentHeight > ridgeTop - 0.85 && random() < 0.45;
      const shape = isCaprock ? (random() < 0.6 ? 'blocky' : 'slab') : (random() < 0.84 ? 'columnar' : 'blocky');
      addRock(
        shape,
        [
          x + columnWidth * 0.5 + (random() - 0.5) * 0.08,
          y + segmentHeight * 0.5,
          0.38 + promontoryPush + (isCaprock ? 0.32 : 0) + random() * 0.24,
        ],
        [
          columnWidth * (isCaprock ? 0.70 : 0.52),
          segmentHeight * 0.56,
          0.46 + random() * 0.38,
        ],
        [
          (random() - 0.5) * 0.08,
          (random() - 0.5) * 0.22,
          (random() - 0.5) * 0.06,
        ],
        'wall',
      );
      y += segmentHeight * (0.86 + random() * 0.10);
    }
    x += columnWidth * (0.84 + random() * 0.14);
  }

  addTalusApron(addRock, random, 52 + Math.round(density * 32), CLIFF_PROFILES.basalt.weights, base);
}

function buildBrecciaLayout(addRock, random, density, base) {
  // 1. Towering crag buttress ribs and spires
  for (let x = -7.45; x < 7.45; x += 0.96 + random() * 0.38) {
    const ridgeTop = sampleRidgeHeight(base.ridge, x);
    for (let y = -3.35; y < ridgeTop; y += 0.84 + random() * 0.44) {
      if (random() < 0.08) continue;
      const nearCrown = y > ridgeTop - 1.45;
      const shape = nearCrown && random() < 0.58
        ? 'spire'
        : chooseWeighted(random, CLIFF_PROFILES.breccia.weights);
      const sizeScale = 0.82 + random() * 0.92;
      const width = (shape === 'spire' ? (0.46 + random() * 0.52) : (0.50 + random() * 0.82)) * sizeScale;
      const height = (shape === 'spire' ? (0.85 + random() * 1.05) : (0.48 + random() * 0.82)) * sizeScale;
      const depth = (0.46 + random() * 0.72) * sizeScale;
      addRock(
        shape,
        [
          x + (random() - 0.5) * 0.38,
          y + (random() - 0.5) * 0.28,
          0.38 + random() * 0.52,
        ],
        [width, height, depth],
        [
          (random() - 0.5) * 0.28,
          (random() - 0.5) * 0.52,
          (random() - 0.5) * 0.24,
        ],
        'wall',
      );
    }
  }

  addTalusApron(addRock, random, 58 + Math.round(density * 36), CLIFF_PROFILES.breccia.weights, base);
}

function addTalusApron(addRock, random, count, weights, base) {
  for (let index = 0; index < count; index += 1) {
    const x = -8.15 + random() * 16.3;
    const centerFactor = 1 - Math.pow(Math.abs(x) / 8.5, 1.6);
    // Bank higher inside recessed gullies, spill further forward in Z at the base
    const baseFrontZ = sampleHeightField(base.grid, base.frontNodes, x, -3.6);
    const gullyBonus = Math.max(0, -baseFrontZ) * 0.65;
    const slopeT = Math.pow(random(), 0.82); // 0 = high against cliff toe, 1 = far out on ground apron
    const y = -2.15 * (1 - slopeT) + (-4.38 + (random() - 0.5) * 0.28) * slopeT + centerFactor * 0.32 + gullyBonus * (1 - slopeT);
    const zForward = 0.42 + slopeT * (1.45 + random() * 1.15) + (random() - 0.5) * 0.25;

    // Multi-scale talus: big tumbled boulders + medium broken blocks + smaller angular scree
    const tierRoll = random();
    let scale;
    let tier;
    if (tierRoll < 0.24) {
      scale = 0.52 + random() * 0.44;
      tier = 'talus-large';
    } else if (tierRoll < 0.64) {
      scale = 0.30 + random() * 0.26;
      tier = 'talus-medium';
    } else {
      scale = 0.17 + random() * 0.16;
      tier = 'talus-small';
    }

    const shape = random() < 0.52 ? 'rubble' : chooseWeighted(random, weights);
    addRock(
      shape,
      [x, y, zForward],
      [
        scale * (0.88 + random() * 0.68),
        scale * (shape === 'slab' ? 0.38 + random() * 0.30 : 0.64 + random() * 0.62),
        scale * (0.80 + random() * 0.72),
      ],
      [(random() - 0.5) * 0.95, random() * Math.PI * 2, (random() - 0.5) * 0.95],
      tier,
    );
  }
}

function makeRockCollection(options) {
  const type = CLIFF_PROFILES[options.cliffType] ? options.cliffType : 'layered';
  const profile = CLIFF_PROFILES[type];
  const seed = Number(options.seed ?? 2417);
  const random = seededRandom((seed ^ 0x9e3779b9) >>> 0);
  const density = clamp(Number(options.density ?? 58), 0, 100) / 100;
  const openingNorm = clamp(Number(options.opening ?? 32), 0, 100) / 100;
  const angleDeg = Number(options.angle ?? -8);
  const wander = clamp(Number(options.wander ?? 48), 0, 100);
  const satmap = satmapInfo(options.satmap, type);

  const base = makeCliffBase(type, seed, options);
  const rocks = [];
  const crackRate = clamp(profile.fractureRate * (0.65 + density * 0.55), 0.25, 0.92);

  const addRockRaw = addRockFactory(seed, random, rocks, satmap.id, {
    crackRate,
    density: clamp(38 + density * 48, 25, 88),
    wander,
    angleDeg,
    openingNorm,
  });

  const addRock = (shape, center, size, rotation = [0, 0, 0], tier = 'wall') => {
    const edgeDistance = signedPolygonDistance(base.silhouette, center[0], center[1]);
    if (tier === 'wall' && edgeDistance > Math.max(size[0], size[1]) * 1.45) return;
    const sampleY = clamp(center[1], base.grid.minY + 0.1, base.grid.maxY - 0.1);
    const frontZ = sampleHeightField(base.grid, base.frontNodes, center[0], sampleY);
    const tilt = tier.startsWith('talus') ? [0, 0] : cliffSurfaceTilt(base, center[0], sampleY);
    addRockRaw(
      shape,
      [center[0], center[1], frontZ + center[2] - 0.14],
      size,
      [rotation[0] + tilt[0], rotation[1] + tilt[1], rotation[2]],
      tier,
    );
  };

  if (type === 'layered') buildLayeredLayout(addRock, random, density, base);
  else if (type === 'basalt') buildBasaltLayout(addRock, random, density, base);
  else buildBrecciaLayout(addRock, random, density, base);

  const grooves = [];
  let crackedRocks = 0;
  for (const rock of rocks) {
    if (!rock.isCracked || !rock.network) continue;
    let added = 0;
    for (const event of rock.network.events) {
      for (const segment of event.surfaceSegments) {
        if (segment.kind !== 'rock') continue;
        const worldNormal = rotate(segment.normal, rock.rotation);
        if (worldNormal.z < -0.15) continue;
        grooves.push({
          a: toWorld(segment.a, rock.center, rock.rotation),
          b: toWorld(segment.b, rock.center, rock.rotation),
          normal: worldNormal,
          rockId: rock.id,
        });
        added += 1;
      }
    }
    if (added > 0) crackedRocks += 1;
  }

  return { type, profile, satmap, base, rocks, grooves, crackedRocks, seed };
}

export function cliffTypeInfo(type) {
  const profile = CLIFF_PROFILES[type] ?? CLIFF_PROFILES.layered;
  const mix = Object.entries(profile.weights)
    .map(([name, weight]) => `${Math.round(weight * 100)}% ${name}`)
    .join(' · ');
  return {
    name: profile.name,
    description: profile.description,
    mix,
    defaultSatmap: profile.defaultSatmap,
  };
}

/**
 * Build a closed, watertight 2-manifold low-poly cliff backing core from base.grid,
 * base.frontNodes, base.backNodes, and base.ridge so the cliff silhouette and crevices
 * are 100% sealed behind the sharp fractured rock assembly.
 */
function buildCliffBasePolyhedronFaces(base) {
  const cols = base.grid.columns;
  const rows = base.grid.rows;
  const stepX = (base.grid.maxX - base.grid.minX) / (cols - 1);

  const front = [];
  const back = [];
  for (let r = 0; r < rows; r += 1) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      const fn = base.frontNodes[idx];
      const bn = base.backNodes[idx];
      const x = base.grid.minX + c * stepX;
      // Taper side walls slightly inward and snap top crown to base.ridge
      const sideTaper = 1 - 0.08 * (1 - v);
      const shapedX = clamp(x * sideTaper, -8.35, 8.35);
      const ridgeTop = sampleRidgeHeight(base.ridge, shapedX) - 0.18;
      const bottomY = base.bottomY + 0.08;
      const shapedY = bottomY + (ridgeTop - bottomY) * v;
      // Recess backing core slightly behind the front rock layer so sharp rocks lead the face
      const frontZ = fn.z - 0.16;
      const backZ = Math.min(bn.z, frontZ - 1.25);

      front.push({ x: shapedX, y: shapedY, z: frontZ });
      back.push({ x: shapedX, y: shapedY, z: backZ });
    }
  }

  const faces = [];
  const atF = (r, c) => front[r * cols + c];
  const atB = (r, c) => back[r * cols + c];

  // Front surface (outward +Z)
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      faces.push({ points: [atF(r, c), atF(r, c + 1), atF(r + 1, c + 1)], kind: 'base', tone: 0.35 });
      faces.push({ points: [atF(r, c), atF(r + 1, c + 1), atF(r + 1, c)], kind: 'base', tone: 0.32 });
    }
  }
  // Back surface (outward -Z)
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      faces.push({ points: [atB(r, c), atB(r + 1, c + 1), atB(r, c + 1)], kind: 'base', tone: 0.22 });
      faces.push({ points: [atB(r, c), atB(r + 1, c), atB(r + 1, c + 1)], kind: 'base', tone: 0.20 });
    }
  }
  // Top rim (r = rows - 1, outward +Y)
  const topR = rows - 1;
  for (let c = 0; c < cols - 1; c += 1) {
    faces.push({ points: [atF(topR, c), atF(topR, c + 1), atB(topR, c + 1)], kind: 'base', tone: 0.48 });
    faces.push({ points: [atF(topR, c), atB(topR, c + 1), atB(topR, c)], kind: 'base', tone: 0.45 });
  }
  // Bottom rim (r = 0, outward -Y)
  for (let c = 0; c < cols - 1; c += 1) {
    faces.push({ points: [atB(0, c), atB(0, c + 1), atF(0, c + 1)], kind: 'base', tone: 0.18 });
    faces.push({ points: [atB(0, c), atF(0, c + 1), atF(0, c)], kind: 'base', tone: 0.18 });
  }
  // Left wall (c = 0, outward -X)
  for (let r = 0; r < rows - 1; r += 1) {
    faces.push({ points: [atB(r, 0), atF(r, 0), atF(r + 1, 0)], kind: 'base', tone: 0.28 });
    faces.push({ points: [atB(r, 0), atF(r + 1, 0), atB(r + 1, 0)], kind: 'base', tone: 0.26 });
  }
  // Right wall (c = cols - 1, outward +X)
  const rightC = cols - 1;
  for (let r = 0; r < rows - 1; r += 1) {
    faces.push({ points: [atF(r, rightC), atB(r, rightC), atB(r + 1, rightC)], kind: 'base', tone: 0.28 });
    faces.push({ points: [atF(r, rightC), atB(r + 1, rightC), atF(r + 1, rightC)], kind: 'base', tone: 0.26 });
  }

  return faces;
}

/**
 * Append a closed polyhedral component's faces to the master triangle soup while
 * verifying 100% 2-manifold watertightness in .toFixed(5) vertex coordinates.
 */
function appendVerifiedManifoldComponent(worldFaces, componentId, usedGlobalKeys, colorFn, outputPositions, outputNormals, outputColors) {
  // Micro-offset per component so two distinct rocks never accidentally share a .toFixed(5) vertex key
  const nudgeX = ((componentId * 37) % 97) * 1.13e-4;
  const nudgeY = ((componentId * 53) % 89) * 1.07e-4;
  const nudgeZ = ((componentId * 71) % 83) * 1.19e-4;

  const vertexList = [];
  const localFixedKeys = new Set();

  const getVertexIndex = (rawPt) => {
    for (let i = 0; i < vertexList.length; i += 1) {
      const candidate = vertexList[i].raw;
      const dx = candidate.x - rawPt.x;
      const dy = candidate.y - rawPt.y;
      const dz = candidate.z - rawPt.z;
      if (dx * dx + dy * dy + dz * dz <= 1e-10) return i;
    }

    let fx = Math.fround(rawPt.x + nudgeX);
    let fy = Math.fround(rawPt.y + nudgeY);
    let fz = Math.fround(rawPt.z + nudgeZ);
    let fixedKey = `${fx.toFixed(5)},${fy.toFixed(5)},${fz.toFixed(5)}`;
    let guard = 0;
    while ((usedGlobalKeys.has(fixedKey) || localFixedKeys.has(fixedKey)) && guard < 24) {
      guard += 1;
      fx = Math.fround(fx + 2.3e-5 * guard);
      fy = Math.fround(fy + 3.1e-5 * guard);
      fz = Math.fround(fz + 1.7e-5 * guard);
      fixedKey = `${fx.toFixed(5)},${fy.toFixed(5)},${fz.toFixed(5)}`;
    }

    const idx = vertexList.length;
    localFixedKeys.add(fixedKey);
    vertexList.push({ raw: rawPt, x: fx, y: fy, z: fz, fixedKey });
    return idx;
  };

  const triangles = [];
  for (const face of worldFaces) {
    if (!face.points || face.points.length < 3) continue;
    const rawIndices = face.points.map(getVertexIndex);
    const cleaned = [];
    for (const idx of rawIndices) {
      if (!cleaned.length || cleaned[cleaned.length - 1] !== idx) cleaned.push(idx);
    }
    if (cleaned.length > 1 && cleaned[0] === cleaned[cleaned.length - 1]) cleaned.pop();
    if (cleaned.length < 3) continue;

    for (let i = 1; i < cleaned.length - 1; i += 1) {
      const a = cleaned[0];
      const b = cleaned[i];
      const c = cleaned[i + 1];
      if (a === b || b === c || c === a) continue;
      triangles.push({ a, b, c, face });
    }
  }

  if (triangles.length < 4) return false;

  // Verify exact .toFixed(5) edge manifoldness (every edge shared by 2 triangles)
  const edgeCounts = new Map();
  for (const { a, b, c } of triangles) {
    const ka = vertexList[a].fixedKey;
    const kb = vertexList[b].fixedKey;
    const kc = vertexList[c].fixedKey;
    if (ka === kb || kb === kc || kc === ka) return false;
    for (const [u, v] of [[ka, kb], [kb, kc], [kc, ka]]) {
      const edge = u < v ? `${u}|${v}` : `${v}|${u}`;
      edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
    }
  }
  for (const count of edgeCounts.values()) {
    if (count !== 2) return false;
  }

  for (const v of vertexList) usedGlobalKeys.add(v.fixedKey);

  for (const { a, b, c, face } of triangles) {
    const va = vertexList[a];
    const vb = vertexList[b];
    const vc = vertexList[c];
    const normal = faceNormal([va, vb, vc]);
    const centroid = {
      x: (va.x + vb.x + vc.x) / 3,
      y: (va.y + vb.y + vc.y) / 3,
      z: (va.z + vb.z + vc.z) / 3,
    };
    const color = colorFn(centroid, normal, face);
    for (const v of [va, vb, vc]) {
      outputPositions.push(v.x, v.y, v.z);
      outputNormals.push(normal.x, normal.y, normal.z);
      outputColors.push(color[0], color[1], color[2]);
    }
  }

  return true;
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
  const grooveWidth = 0.018 + (clamp(Number(options.opening ?? 32), 0, 100) / 100) * 0.105;

  const outputPositions = [];
  const outputNormals = [];
  const outputColors = [];
  const usedGlobalKeys = new Set();
  const satmapKey = collection.satmap.id;

  // 1. Emit the watertight, faceted low-poly cliff backing core
  const baseFaces = buildCliffBasePolyhedronFaces(collection.base);
  appendVerifiedManifoldComponent(
    baseFaces,
    0,
    usedGlobalKeys,
    (centroid, normal, face) => {
      const baseColor = computeSatMapColorForPoint(
        satmapKey,
        centroid.x,
        centroid.y,
        centroid.z,
        normal,
        { satmapBias: face.tone ?? 0.35 },
        'rock',
        centroid.z,
      );
      // Slight crevice darkening on the recessed cliff backing core
      return baseColor.map((c) => clamp(c * 0.78, 0, 1));
    },
    outputPositions,
    outputNormals,
    outputColors,
  );

  // 2. Emit every sharp, 3D fractured rock polyhedron (with sealed recessed 3D crack fissures)
  for (const rock of collection.rocks) {
    const transformFaceList = (faces) => faces.map((face) => ({
      ...face,
      points: face.points.map((pt) => toWorld(pt, rock.center, rock.rotation)),
    }));

    const colorRockFace = (centroid, normal, face) => {
      const frontZ = sampleHeightField(collection.base.grid, collection.base.frontNodes, centroid.x, clamp(centroid.y, -4.5, 4.5));
      const reliefProtrusion = centroid.z - frontZ;
      const satColor = computeSatMapColorForPoint(
        satmapKey,
        centroid.x,
        centroid.y,
        centroid.z,
        normal,
        rock,
        face.kind,
        reliefProtrusion,
      );

      // Geometry-aware curvature / ambient occlusion & per-facet crisp contrast
      const heightFactor = clamp((centroid.y + 4.55) / 8.8, 0, 1);
      const alcoveAO = clamp(0.84 + 0.14 * reliefProtrusion + 0.10 * heightFactor, 0.68, 1.10);
      const facetContrast = face.kind === 'fracture'
        ? (0.82 + (face.tone ?? 0.15) * 0.25)
        : (0.93 + (face.tone ?? 0.5) * 0.14);
      const factor = alcoveAO * facetContrast;

      return [
        clamp(satColor[0] * factor, 0, 1),
        clamp(satColor[1] * factor, 0, 1),
        clamp(satColor[2] * factor, 0, 1),
      ];
    };

    const primaryFaces = transformFaceList(rock.sealedFaces);
    const added = appendVerifiedManifoldComponent(
      primaryFaces,
      rock.id,
      usedGlobalKeys,
      colorRockFace,
      outputPositions,
      outputNormals,
      outputColors,
    );

    // Fallback to unfractured rock hull if a extreme cut ever produced a sub-tolerance sliver
    if (!added) {
      const fallbackFaces = transformFaceList(rock.outlineFaces);
      appendVerifiedManifoldComponent(
        fallbackFaces,
        rock.id + 10000,
        usedGlobalKeys,
        colorRockFace,
        outputPositions,
        outputNormals,
        outputColors,
      );
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
    material: {
      shading: 'SatMap multi-band geological color ramp + height-weathering + SDF curvature/AO + structured procedural stamps',
      satmap: collection.satmap,
      crackTexture: false,
    },
    grid: { nx, ny, nz, spacing: [round(dx), round(dy), round(dz)], bounds },
    summary: {
      rockCount: collection.rocks.length,
      crackedRocks: collection.crackedRocks,
      jointTraces: collection.grooves.length,
      triangleCount: mesh.triangleCount,
      watertight: mesh.closed,
    },
    recipe: collection.rocks.map(({ seed, shape, tier, isCracked, center, size, rotation, color }) => ({
      seed,
      shape,
      tier,
      isCracked,
      center,
      size,
      rotation,
      color,
    })),
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
