import {
  buildSealedRockMesh,
  generateFractureNetwork,
  makeRockPolyhedron,
  networkToJSON,
  polyhedronVertices,
} from './fracture-core.js';
import {
  buildCliffMesh,
  cliffTypeInfo,
  sampleSatMap,
  satmapInfo,
} from './cliff-core.js';

const canvas = document.querySelector('#fracture-canvas');
const canvasWrap = document.querySelector('#canvas-wrap');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });

const ROCK_ARCHETYPE_INFO = {
  blocky: {
    size: { x: 1.24, y: 1.08, z: 1.02 },
    description: 'Chunky multi-faceted cliff block with planar cleavage faces and sealed 3D fracture grooves.',
  },
  slab: {
    size: { x: 1.52, y: 0.56, z: 1.28 },
    description: 'Flat, wide stratified rock plate / cantilevered overhang shelf with sharp perimeter facets.',
  },
  jagged: {
    size: { x: 1.28, y: 1.16, z: 1.04 },
    description: 'Craggy, high-contrast angular outcrop with sharp directional prows and steep shear facets.',
  },
  columnar: {
    size: { x: 0.88, y: 1.46, z: 0.86 },
    description: 'Polygonal 5–7 sided basalt prism with crisp vertical faces and chiseled cross-joint caps.',
  },
  spire: {
    size: { x: 0.94, y: 1.44, z: 0.88 },
    description: 'Steep upward-tapering alpine crag pinnacle with fluted vertical facets and a narrow crest.',
  },
  rubble: {
    size: { x: 1.12, y: 0.88, z: 0.96 },
    description: 'Asymmetric broken talus boulder and angular scree wedge for cliff-toe aprons.',
  },
};

const elements = {
  blockButton: document.querySelector('#block-view-button'),
  cliffButton: document.querySelector('#cliff-view-button'),
  stageTitle: document.querySelector('#stage-title'),
  canvasMode: document.querySelector('#canvas-mode-label'),
  overlayLabel: document.querySelector('#overlay-label'),
  overlayCoordinate: document.querySelector('#overlay-coordinate'),
  cliffType: document.querySelector('#cliff-type-select'),
  cliffTypeGroup: document.querySelector('#cliff-type-group'),
  rockType: document.querySelector('#rock-type-select'),
  rockTypeGroup: document.querySelector('#rock-type-group'),
  rockTypeDescription: document.querySelector('#rock-type-description'),
  satmap: document.querySelector('#satmap-select'),
  satmapRamp: document.querySelector('#satmap-ramp'),
  satmapDescription: document.querySelector('#satmap-description'),
  cliffBaseControls: document.querySelector('#cliff-base-controls'),
  cliffContour: document.querySelector('#cliff-contour-range'),
  cliffContourOutput: document.querySelector('#cliff-contour-output'),
  cliffRelief: document.querySelector('#cliff-relief-range'),
  cliffReliefOutput: document.querySelector('#cliff-relief-output'),
  cliffTypeDescription: document.querySelector('#cliff-type-description'),
  cliffRockMix: document.querySelector('#cliff-rock-mix'),
  timelineLabel: document.querySelector('#timeline-label'),
  timelineStart: document.querySelector('#timeline-start'),
  timelineEnd: document.querySelector('#timeline-end'),
  densityLow: document.querySelector('#density-low'),
  densityHigh: document.querySelector('#density-high'),
  gapLow: document.querySelector('#gap-low'),
  gapHigh: document.querySelector('#gap-high'),
  growthLegend: document.querySelector('#growth-legend'),
  methodHeading: document.querySelector('#method-heading'),
  methodCopy: document.querySelector('#method-copy'),
  methodCaveat: document.querySelector('#method-caveat-copy'),
  densityLabel: document.querySelector('#density-label'),
  gapLabel: document.querySelector('#gap-label'),
  statLabels: [...document.querySelectorAll('.stat-label')],
  density: document.querySelector('#density-range'),
  densityOutput: document.querySelector('#density-output'),
  wander: document.querySelector('#wander-range'),
  wanderOutput: document.querySelector('#wander-output'),
  angle: document.querySelector('#angle-range'),
  angleOutput: document.querySelector('#angle-output'),
  gap: document.querySelector('#gap-range'),
  gapOutput: document.querySelector('#gap-output'),
  surfaceDetail: document.querySelector('#surface-detail-range'),
  surfaceDetailOutput: document.querySelector('#surface-detail-output'),
  seed: document.querySelector('#seed-input'),
  randomSeed: document.querySelector('#random-seed-button'),
  generate: document.querySelector('#generate-button'),
  play: document.querySelector('#play-button'),
  playLabel: document.querySelector('#play-label'),
  growth: document.querySelector('#growth-range'),
  growthReadout: document.querySelector('#growth-readout'),
  fractureCount: document.querySelector('#fracture-count'),
  fragmentCount: document.querySelector('#fragment-count'),
  generationCount: document.querySelector('#generation-count'),
  emptyState: document.querySelector('#canvas-empty-state'),
  export: document.querySelector('#export-button'),
  exportLabel: document.querySelector('#export-label'),
  exportRecipe: document.querySelector('#export-recipe-button'),
};

const meshShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;
  uniform mat4 uModel;
  uniform mat4 uViewProjection;
  uniform mat3 uNormalMatrix;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = uModel * vec4(aPosition, 1.0);
    gl_Position = uViewProjection * worldPosition;
    vNormal = normalize(uNormalMatrix * aNormal);
    vColor = aColor;
    vWorldPosition = worldPosition.xyz;
  }
`;

const meshFragmentSource = `
  precision mediump float;
  uniform vec3 uLightDirection;
  uniform float uMaterialType;
  uniform float uSurfaceDetail;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vWorldPosition;

  float narrowStamp(float phase, float sharpness) {
    return pow(max(0.0, cos(phase)), sharpness);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 keyDir = normalize(uLightDirection);
    vec3 fillDir = normalize(vec3(0.66, 0.28, 0.48));
    vec3 backDir = normalize(vec3(0.12, -0.78, -0.60));

    // Crisp 3-point directional lighting so adjacent flat polygon facets pop with sharp contrast
    float keyDiffuse = max(dot(normal, keyDir), 0.0);
    float fillDiffuse = max(dot(normal, fillDir), 0.0);
    float backDiffuse = max(dot(normal, backDir), 0.0);
    float skyHemi = 0.5 + 0.5 * normal.y;
    float light = 0.34 + 0.62 * keyDiffuse + 0.18 * fillDiffuse + 0.08 * skyHemi + 0.05 * backDiffuse;

    float detail = clamp(uSurfaceDetail, 0.0, 1.0);
    float height = smoothstep(-4.4, 3.8, vWorldPosition.y);
    float exposure = 0.90 + 0.14 * height + 0.05 * max(normal.y, 0.0);
    vec3 color = vColor * exposure;
    float stamp = 0.0;

    if (uMaterialType >= -0.5 && uMaterialType < 0.5) {
      float phase = dot(vWorldPosition, vec3(0.72, 0.24, 0.65)) * 6.2;
      phase += 0.28 * sin(vWorldPosition.y * 1.9 + vWorldPosition.z * 0.9);
      stamp = -0.14 * narrowStamp(phase, 18.0) + 0.045 * sin(phase * 0.42);
    } else if (uMaterialType >= 0.5 && uMaterialType < 1.5) {
      // Sedimentary SatMap micro-strata seams and inter-bedding highlights
      float phase = vWorldPosition.y * 8.2;
      phase += 0.34 * sin(vWorldPosition.x * 0.54) + 0.18 * sin(vWorldPosition.z * 0.95);
      float seam = narrowStamp(phase, 22.0);
      float halo = narrowStamp(phase - 0.32, 5.0);
      stamp = -0.16 * seam + 0.065 * halo;
    } else if (uMaterialType >= 1.5 && uMaterialType < 2.5) {
      // Basalt column prism face accents and cross-joint oxidation bands
      float columnPhase = vWorldPosition.x * 8.6 + 0.28 * sin(vWorldPosition.z * 1.5);
      float columnSeam = narrowStamp(columnPhase, 16.0);
      float crossJoint = narrowStamp(vWorldPosition.y * 3.8 + 0.18 * sin(vWorldPosition.x), 20.0);
      stamp = -0.14 * columnSeam - 0.09 * crossJoint;
    } else if (uMaterialType >= 2.5) {
      // Crag / breccia conjugate mineral veins and shear banding
      float phase = dot(vWorldPosition, vec3(0.64, 0.32, 0.70)) * 6.4;
      phase += 0.26 * sin(vWorldPosition.y * 1.4 + vWorldPosition.x * 0.42);
      stamp = -0.16 * narrowStamp(phase, 20.0) + 0.035 * sin(phase * 0.35);
    }

    color *= 1.0 + stamp * detail;
    color *= light;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

const lineVertexSource = `
  attribute vec3 aPosition;
  uniform mat4 uModel;
  uniform mat4 uViewProjection;
  void main() {
    gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);
  }
`;

const lineFragmentSource = `
  precision mediump float;
  uniform vec4 uLineColor;
  void main() {
    gl_FragColor = uLineColor;
  }
`;

let view = 'cliff';
let cliffAssembly = null;
let networks = [];
let eventOffsets = [];
let totalEvents = 0;
let progress = 0;
let isPlaying = false;
let animationFrame = 0;
let previousFrameTime = 0;
let resizeObserver;
let rebuildTimer = 0;
let currentStateKey = '';
let meshProgram;
let lineProgram;
let meshLocations;
let lineLocations;
let pieceRecords = [];
let floorBuffers = null;
let activeLineBuffer = null;
let activeLineCount = 0;
let activeLineModel = identityMatrix();
let activeLineVisible = false;
let bufferPixelRatio = 1;
let canvasWidth = 0;
let canvasHeight = 0;
let frameHandle = 0;
let dragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
let yaw = 0.56;
let pitch = 0.26;
let cameraDistance = 15.8;
let groundHeight = -1.29;

if (!gl) {
  elements.emptyState.hidden = false;
  elements.emptyState.querySelector('span:last-child').textContent = 'WebGL is unavailable in this browser, so the 3D specimen could not be drawn.';
} else {
  meshProgram = createProgram(meshShaderSource, meshFragmentSource);
  lineProgram = createProgram(lineVertexSource, lineFragmentSource);
  meshLocations = {
    position: gl.getAttribLocation(meshProgram, 'aPosition'),
    normal: gl.getAttribLocation(meshProgram, 'aNormal'),
    color: gl.getAttribLocation(meshProgram, 'aColor'),
    model: gl.getUniformLocation(meshProgram, 'uModel'),
    viewProjection: gl.getUniformLocation(meshProgram, 'uViewProjection'),
    normalMatrix: gl.getUniformLocation(meshProgram, 'uNormalMatrix'),
    lightDirection: gl.getUniformLocation(meshProgram, 'uLightDirection'),
    materialType: gl.getUniformLocation(meshProgram, 'uMaterialType'),
    surfaceDetail: gl.getUniformLocation(meshProgram, 'uSurfaceDetail'),
  };
  lineLocations = {
    position: gl.getAttribLocation(lineProgram, 'aPosition'),
    model: gl.getUniformLocation(lineProgram, 'uModel'),
    viewProjection: gl.getUniformLocation(lineProgram, 'uViewProjection'),
    color: gl.getUniformLocation(lineProgram, 'uLineColor'),
  };
  activeLineBuffer = gl.createBuffer();
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(28 / 255, 34 / 255, 32 / 255, 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  floorBuffers = createFloorBuffers();
  initialiseCanvas();
  resetCamera();
  rebuild();
  frameHandle = requestAnimationFrame(renderFrame);
}

function currentOptions() {
  const seed = clamp(Math.round(Number(elements.seed.value) || 1), 1, 999999);
  elements.seed.value = String(seed);
  return {
    seed,
    density: Number(elements.density.value),
    wander: Number(elements.wander.value),
    angle: Number(elements.angle.value),
    opening: Number(elements.gap.value),
    cliffType: elements.cliffType.value,
    rockType: elements.rockType?.value ?? 'blocky',
    satmap: elements.satmap?.value ?? 'auto',
    cliffContour: Number(elements.cliffContour.value),
    cliffRelief: Number(elements.cliffRelief.value),
    surfaceDetail: Number(elements.surfaceDetail.value),
  };
}

function updateSliderFills() {
  [elements.density, elements.wander, elements.angle, elements.gap, elements.cliffContour, elements.cliffRelief, elements.surfaceDetail].forEach((slider) => {
    if (!slider) return;
    const min = Number(slider.min);
    const max = Number(slider.max);
    const value = Number(slider.value);
    const percent = ((value - min) / (max - min)) * 100;
    slider.style.setProperty('--range-progress', `${percent}%`);
  });
}

function updateSatmapPreview() {
  if (!elements.satmapRamp) return;
  const info = satmapInfo(elements.satmap?.value ?? 'auto', elements.cliffType.value);
  const gradientStops = info.stops
    .map((hex, idx) => `${hex} ${((idx / (info.stops.length - 1)) * 100).toFixed(1)}%`)
    .join(', ');
  elements.satmapRamp.style.background = `linear-gradient(90deg, ${gradientStops})`;
  if (elements.satmapDescription) {
    elements.satmapDescription.textContent = `${info.name} — ${info.subtitle}`;
  }
}

function updateLabels() {
  elements.densityOutput.value = elements.density.value;
  elements.wanderOutput.value = `${elements.wander.value}%`;
  const angle = Number(elements.angle.value);
  elements.angleOutput.value = `${angle < 0 ? '−' : '+'}${Math.abs(angle)}°`;
  elements.gapOutput.value = `${elements.gap.value}%`;
  elements.cliffContourOutput.value = `${elements.cliffContour.value}%`;
  elements.cliffReliefOutput.value = `${elements.cliffRelief.value}%`;
  elements.surfaceDetailOutput.value = `${elements.surfaceDetail.value}%`;
  elements.densityLabel.textContent = view === 'cliff' ? 'Rock packing & crack density' : 'Fracture density';
  elements.gapLabel.textContent = view === 'cliff' ? 'Sealed joint opening' : 'Sealed joint opening';
  const formation = cliffTypeInfo(elements.cliffType.value);
  elements.cliffTypeDescription.textContent = formation.description;
  elements.cliffRockMix.textContent = formation.mix;
  if (elements.rockType && elements.rockTypeDescription) {
    const archetype = ROCK_ARCHETYPE_INFO[elements.rockType.value] ?? ROCK_ARCHETYPE_INFO.blocky;
    elements.rockTypeDescription.textContent = archetype.description;
  }
  updateSatmapPreview();
  updateSliderFills();
}

function rebuild() {
  if (!gl) return;
  window.clearTimeout(rebuildTimer);
  pausePlayback();
  const options = currentOptions();
  elements.emptyState.hidden = false;

  if (view === 'cliff') {
    cliffAssembly = buildCliffMesh(options);
    networks = [];
    elements.stageTitle.textContent = cliffAssembly.profile.name;
    elements.canvasMode.textContent = 'SHARP POLYGON ROCKS · SEALED JOINTS';
    const minY = minimumMeshY(cliffAssembly.mesh.positions);
    groundHeight = minY - 0.025;
  } else {
    cliffAssembly = null;
    const archetype = ROCK_ARCHETYPE_INFO[options.rockType] ?? ROCK_ARCHETYPE_INFO.blocky;
    const outline = makeRockPolyhedron(options.seed, archetype.size, options.rockType);
    networks = [{
      ...generateFractureNetwork(outline, options),
      rockType: options.rockType,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
    }];
    const typeLabel = elements.rockType?.selectedOptions?.[0]?.textContent ?? 'Single fractured rock volume';
    elements.stageTitle.textContent = `${typeLabel} (sealed single mesh)`;
    elements.canvasMode.textContent = 'SINGLE SEALED MESH · DRAG TO ORBIT';
    groundHeight = computeGroundHeight(networks);
  }

  setControlMode();
  eventOffsets = [];
  totalEvents = 0;
  for (const network of networks) {
    eventOffsets.push(totalEvents);
    totalEvents += network.events.length;
  }

  progress = totalEvents;
  elements.growth.max = String(Math.max(1, totalEvents));
  elements.growth.value = String(progress);
  elements.emptyState.hidden = view === 'cliff'
    ? Boolean(cliffAssembly?.mesh.vertexCount)
    : totalEvents > 0;
  updateStats();
  updateGrowthReadout();
  updateLabels();
  currentStateKey = '';
  mountVisiblePieces(true);
  updateActiveCrack();
}

function setControlMode() {
  const isCliff = view === 'cliff';
  elements.cliffTypeGroup.hidden = !isCliff;
  if (elements.rockTypeGroup) elements.rockTypeGroup.hidden = isCliff;
  elements.cliffBaseControls.hidden = !isCliff;
  elements.play.disabled = isCliff;
  elements.growth.disabled = isCliff;
  elements.play.setAttribute('aria-label', isCliff ? 'Static cliff assembly' : 'Replay crack propagation');
  elements.generate.querySelector('span:first-child').textContent = isCliff ? 'Rebuild sealed cliff' : 'Generate fractures';
  elements.exportLabel.textContent = isCliff ? 'EXPORT SEALED CLIFF STL' : 'EXPORT FRACTURE POLYGONS JSON';
  elements.exportRecipe.hidden = !isCliff;
  elements.densityLabel.textContent = isCliff ? 'Rock packing & crack density' : 'Fracture density';
  elements.gapLabel.textContent = 'Sealed joint opening';
  elements.timelineLabel.textContent = isCliff ? 'SHARP CRACKED ROCK CLIFF' : '3D FRACTURE SEQUENCE';
  elements.timelineStart.textContent = isCliff ? 'CRACKED ROCKS' : 'NUCLEATION';
  elements.timelineEnd.textContent = isCliff ? 'WATERTIGHT SHELL' : 'ARREST / ABUTMENT';
  elements.growth.setAttribute('aria-label', isCliff ? 'Timeline is used in single-rock view' : 'Scrub the three-dimensional fracture propagation sequence');
  elements.densityLow.textContent = isCliff ? 'LOOSE' : 'SPARSE';
  elements.densityHigh.textContent = isCliff ? 'PACKED' : 'CONNECTED';
  elements.gapLow.textContent = 'HAIRLINE';
  elements.gapHigh.textContent = 'DEEP SEALED FISSURE';
  elements.growthLegend.hidden = isCliff;
  elements.overlayLabel.textContent = isCliff ? 'SHARP CRACKED ROCKS / SEALED 3D CLIFF' : 'SINGLE SEALED ROCK / POLYHEDRAL CUTS';
  elements.overlayCoordinate.innerHTML = isCliff
    ? 'CRISP FACETS <span>·</span> SEALED JOINTS <span>·</span> SATMAP ALBEDO'
    : 'ONE SEALED MESH <span>·</span> RECESSED FISSURES <span>·</span> SATMAP ALBEDO';
  canvas.setAttribute('aria-label', isCliff
    ? 'Interactive three-dimensional cliff formed from sharp sealed polygonal rock geometry'
    : 'Interactive three-dimensional rock fractured and sealed into a single watertight polygonal mesh');
  elements.playLabel.textContent = isCliff ? 'Static cliff shell' : 'Replay growth';
  elements.blockButton.classList.toggle('is-active', !isCliff);
  elements.cliffButton.classList.toggle('is-active', isCliff);
  elements.blockButton.setAttribute('aria-pressed', String(!isCliff));
  elements.cliffButton.setAttribute('aria-pressed', String(isCliff));
  elements.methodHeading.innerHTML = isCliff
    ? 'Sharp cracked rocks.<br />Sealed 3D cliff assembly.'
    : 'Single sealed mesh.<br />Recessed 3D fissures.';
  elements.methodCopy.textContent = isCliff
    ? 'Pronounced 3D headlands, overhangs, and gullies guide high-variation rock archetypes (flat cantilevered slabs, blocky stones, jagged crags, basalt columns, spires, and talus boulders). Rocks are fractured in 3D, sealed across opened joints, and colored with multi-stop geological SatMaps.'
    : 'A 3D rock archetype is cut sequentially by primary, secondary, and abutting planes. When joints open, fracture walls bevel inward to a sealed fissure root so the entire cracked stone remains one watertight polygonal mesh with no open interior holes.';
  elements.methodCaveat.textContent = isCliff
    ? '100% crisp polygon facets with zero voxel blur; exports watertight STL and full rock recipe JSON for downstream SDF erosion.'
    : 'True 3D manifold polygon mesh; plane-growth and sealed-fissure geometry ready for SDF conversion and erosion.';
}

function updateStats() {
  if (view === 'cliff' && cliffAssembly) {
    elements.fractureCount.textContent = String(cliffAssembly.summary.crackedRocks).padStart(2, '0');
    elements.fragmentCount.textContent = String(cliffAssembly.summary.rockCount).padStart(2, '0');
    elements.generationCount.textContent = String(cliffAssembly.summary.jointTraces).padStart(2, '0');
    elements.statLabels[0].textContent = 'CRACKED ROCKS';
    elements.statLabels[1].textContent = 'ROCK FORMS';
    elements.statLabels[2].textContent = 'JOINT TRACES';
    return;
  }
  const fractureCount = networks.reduce((sum, network) => sum + network.events.length, 0);
  const fragmentCount = networks.reduce((sum, network) => sum + network.finalPieces.length, 0);
  const generations = new Set(networks.flatMap((network) => network.events.map((event) => event.generation))).size;
  elements.fractureCount.textContent = String(fractureCount).padStart(2, '0');
  elements.fragmentCount.textContent = String(fragmentCount).padStart(2, '0');
  elements.generationCount.textContent = String(generations).padStart(2, '0');
  elements.statLabels[0].textContent = 'JOINT PLANES';
  elements.statLabels[1].textContent = 'LOBES';
  elements.statLabels[2].textContent = 'SETS';
}

function updateGrowthReadout() {
  if (view === 'cliff' && cliffAssembly) {
    elements.growthReadout.textContent = `SHARP SHELL / ${(cliffAssembly.mesh.triangleCount / 1000).toFixed(1)}K TRIS · ${cliffAssembly.summary.crackedRocks} CRACKED ROCKS`;
    return;
  }
  if (progress >= totalEvents || totalEvents === 0) {
    elements.growthReadout.textContent = `SEALED SINGLE MESH / ${totalEvents} JOINTS`;
    return;
  }
  const activeIndex = Math.min(totalEvents, Math.floor(progress) + 1);
  elements.growthReadout.textContent = `JOINT ${String(activeIndex).padStart(2, '0')} / ${String(totalEvents).padStart(2, '0')}`;
}

function pausePlayback() {
  isPlaying = false;
  previousFrameTime = 0;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  elements.play.classList.remove('is-playing');
  elements.play.setAttribute('aria-label', 'Replay crack propagation');
  elements.playLabel.textContent = 'Replay growth';
}

function setProgress(value) {
  if (view === 'cliff') return;
  progress = clamp(value, 0, totalEvents);
  elements.growth.value = String(progress);
  updateGrowthReadout();
  mountVisiblePieces(false);
  updateActiveCrack();
}

function playTick(timestamp) {
  if (!isPlaying) return;
  if (!previousFrameTime) previousFrameTime = timestamp;
  const elapsed = timestamp - previousFrameTime;
  previousFrameTime = timestamp;
  progress = Math.min(totalEvents, progress + elapsed / 930);
  elements.growth.value = String(progress);
  updateGrowthReadout();
  mountVisiblePieces(false);
  updateActiveCrack();

  if (progress >= totalEvents) {
    pausePlayback();
    updateGrowthReadout();
    mountVisiblePieces(false);
    updateActiveCrack();
    return;
  }
  animationFrame = requestAnimationFrame(playTick);
}

function togglePlayback() {
  if (view === 'cliff') return;
  if (isPlaying) {
    pausePlayback();
    return;
  }
  if (totalEvents === 0) return;
  if (progress >= totalEvents) setProgress(0);
  isPlaying = true;
  elements.play.classList.add('is-playing');
  elements.play.setAttribute('aria-label', 'Pause crack propagation');
  elements.playLabel.textContent = 'Pause growth';
  previousFrameTime = 0;
  animationFrame = requestAnimationFrame(playTick);
}

function mountVisiblePieces(force) {
  if (!gl) return;
  if (view === 'cliff') {
    const stateKey = `cliff:${cliffAssembly?.mesh.vertexCount ?? 0}:${cliffAssembly?.summary.triangleCount ?? 0}:${cliffAssembly?.satmap?.id ?? ''}`;
    if (!force && stateKey === currentStateKey) return;
    for (const record of pieceRecords) disposePieceBuffers(record.buffers);
    pieceRecords = [];
    currentStateKey = stateKey;
    if (cliffAssembly?.mesh.vertexCount) {
      const mesh = cliffAssembly.mesh;
      const transform = { position: [0, 0, 0], rotation: [0, 0, 0] };
      pieceRecords.push({
        isCliff: true,
        materialType: cliffMaterialType(cliffAssembly.type),
        network: { transform },
        piece: null,
        gapDistance: 0,
        buffers: createCliffBuffers(mesh, cliffAssembly.grooves),
      });
      mesh.normals = null;
      mesh.colors = null;
    }
    return;
  }

  const openingValue = Number(elements.gap.value);
  const activeSatmap = satmapInfo(elements.satmap?.value ?? 'auto', elements.cliffType.value).id;
  const stateKey = networks.map((network, index) => {
    const local = clamp(progress - eventOffsets[index], 0, network.events.length);
    return `${Math.min(network.events.length, Math.floor(local + 1e-7))}:${openingValue}:${activeSatmap}`;
  }).join(',');
  if (!force && stateKey === currentStateKey) return;

  for (const record of pieceRecords) disposePieceBuffers(record.buffers);
  pieceRecords = [];
  currentStateKey = stateKey;

  networks.forEach((network, networkIndex) => {
    const local = clamp(progress - eventOffsets[networkIndex], 0, network.events.length);
    const completed = Math.min(network.events.length, Math.floor(local + 1e-7));
    const pieces = network.states[Math.min(completed, network.states.length - 1)] ?? network.finalPieces;
    const gap = gapDistance(network);
    const sealedFaces = buildSealedRockMesh(pieces, { gapDistance: gap, grooveInset: 0.28 });
    pieceRecords.push({
      network,
      networkIndex,
      piece: null,
      gapDistance: 0,
      materialType: 0,
      buffers: createSealedRockBuffers(sealedFaces, activeSatmap),
    });
  });
}

function cliffMaterialType(type) {
  return ({ layered: 1, basalt: 2, breccia: 3 })[type] ?? 0;
}

function gapDistance(network) {
  const vertices = polyhedronVertices(network.outline);
  const extent = Math.max(...vertices.map((point) => Math.hypot(point.x, point.y, point.z)));
  const opening = Number(elements.gap.value) / 100;
  return extent * (0.008 + opening * 0.058);
}

function computeGroundHeight(networkList) {
  let lowest = Infinity;
  for (const network of networkList) {
    const matrix = modelMatrix(network.transform, { x: 0, y: 0, z: 0 });
    for (const point of polyhedronVertices(network.outline)) {
      const worldY = matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13];
      lowest = Math.min(lowest, worldY);
    }
  }
  return Number.isFinite(lowest) ? lowest - 0.065 : -1;
}

function makeRockFaceSatMapColor(face, normal, satmapKey) {
  const centroid = face.points.reduce(
    (acc, pt) => ({ x: acc.x + pt.x / face.points.length, y: acc.y + pt.y / face.points.length, z: acc.z + pt.z / face.points.length }),
    { x: 0, y: 0, z: 0 },
  );
  const heightNorm = clamp((centroid.y + 1.4) / 2.8, 0, 1);
  const strataWave = 0.5 + 0.5 * Math.sin(centroid.y * 5.2 + centroid.x * 1.4);
  if (face.kind === 'fracture') {
    const crackT = clamp(0.05 + 0.18 * heightNorm + (face.tone ?? 0.15) * 0.22, 0.02, 0.34);
    const base = sampleSatMap(satmapKey, crackT);
    return base.map((c) => clamp(c * 0.58, 0.04, 1));
  }
  const t = clamp(0.22 + 0.45 * heightNorm + 0.18 * strataWave + ((face.tone ?? 0.5) - 0.5) * 0.18 + normal.y * 0.10, 0.08, 0.96);
  return sampleSatMap(satmapKey, t);
}

function createCliffBuffers(mesh, grooves = []) {
  const edges = [];
  for (const groove of grooves) {
    const lift = 0.012;
    edges.push(
      groove.a.x + groove.normal.x * lift,
      groove.a.y + groove.normal.y * lift,
      groove.a.z + groove.normal.z * lift,
      groove.b.x + groove.normal.x * lift,
      groove.b.y + groove.normal.y * lift,
      groove.b.z + groove.normal.z * lift,
    );
  }
  return {
    vertexCount: mesh.vertexCount,
    position: uploadBuffer(mesh.positions, gl.ARRAY_BUFFER),
    normal: uploadBuffer(mesh.normals, gl.ARRAY_BUFFER),
    color: uploadBuffer(mesh.colors, gl.ARRAY_BUFFER),
    edgeCount: edges.length / 3,
    edges: edges.length ? uploadBuffer(new Float32Array(edges), gl.ARRAY_BUFFER) : null,
  };
}

function minimumMeshY(positions) {
  let minimum = Infinity;
  for (let index = 1; index < positions.length; index += 3) minimum = Math.min(minimum, positions[index]);
  return Number.isFinite(minimum) ? minimum : -1;
}

function createSealedRockBuffers(faces, satmapKey) {
  const positions = [];
  const normals = [];
  const colors = [];
  const edges = [];

  for (const face of faces) {
    if (face.points.length < 3) continue;
    const normal = normalForFace(face.points);
    const color = makeRockFaceSatMapColor(face, normal, satmapKey);
    for (let index = 1; index < face.points.length - 1; index += 1) {
      const triangle = [face.points[0], face.points[index], face.points[index + 1]];
      for (const point of triangle) {
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(color[0], color[1], color[2]);
      }
    }
    for (let index = 0; index < face.points.length; index += 1) {
      const a = face.points[index];
      const b = face.points[(index + 1) % face.points.length];
      edges.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  return {
    vertexCount: positions.length / 3,
    position: uploadBuffer(new Float32Array(positions), gl.ARRAY_BUFFER),
    normal: uploadBuffer(new Float32Array(normals), gl.ARRAY_BUFFER),
    color: uploadBuffer(new Float32Array(colors), gl.ARRAY_BUFFER),
    edgeCount: edges.length / 3,
    edges: uploadBuffer(new Float32Array(edges), gl.ARRAY_BUFFER),
  };
}

function createFloorBuffers() {
  const corners = [
    [-11, 0, -11], [-11, 0, 11], [11, 0, 11],
    [-11, 0, -11], [11, 0, 11], [11, 0, -11],
  ];
  const positions = [];
  const normals = [];
  const colors = [];
  for (const [x, y, z] of corners) {
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    colors.push(...hexColor('#2c332e'));
  }
  const edges = [
    -11, 0.001, -11, 11, 0.001, -11,
    11, 0.001, -11, 11, 0.001, 11,
    11, 0.001, 11, -11, 0.001, 11,
    -11, 0.001, 11, -11, 0.001, -11,
  ];
  return {
    vertexCount: positions.length / 3,
    position: uploadBuffer(new Float32Array(positions), gl.ARRAY_BUFFER),
    normal: uploadBuffer(new Float32Array(normals), gl.ARRAY_BUFFER),
    color: uploadBuffer(new Float32Array(colors), gl.ARRAY_BUFFER),
    edgeCount: edges.length / 3,
    edges: uploadBuffer(new Float32Array(edges), gl.ARRAY_BUFFER),
  };
}

function uploadBuffer(data, target) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

function disposePieceBuffers(buffers) {
  if (!gl || !buffers) return;
  gl.deleteBuffer(buffers.position);
  gl.deleteBuffer(buffers.normal);
  gl.deleteBuffer(buffers.color);
  if (buffers.edges) gl.deleteBuffer(buffers.edges);
}

function updateActiveCrack() {
  if (!gl || view === 'cliff') return;
  activeLineCount = 0;
  activeLineVisible = false;
  if (progress >= totalEvents || totalEvents === 0) return;

  let active = null;
  for (let index = 0; index < networks.length; index += 1) {
    const local = progress - eventOffsets[index];
    if (local >= 0 && local < networks[index].events.length) {
      active = { network: networks[index], networkIndex: index, event: networks[index].events[Math.floor(local)], fraction: local - Math.floor(local) };
      break;
    }
  }
  if (!active || active.fraction <= 0 || !active.event.surfaceSegments.length) return;

  const reveal = Math.max(1, Math.ceil(active.fraction * active.event.surfaceSegments.length));
  const gap = gapDistance(active.network);
  const shift = active.event.parentShift;
  const positions = [];
  for (const segment of active.event.surfaceSegments.slice(0, reveal)) {
    const lift = { x: segment.normal.x * 0.009, y: segment.normal.y * 0.009, z: segment.normal.z * 0.009 };
    const a = {
      x: segment.a.x + shift.x * gap + lift.x,
      y: segment.a.y + shift.y * gap + lift.y,
      z: segment.a.z + shift.z * gap + lift.z,
    };
    const b = {
      x: segment.b.x + shift.x * gap + lift.x,
      y: segment.b.y + shift.y * gap + lift.y,
      z: segment.b.z + shift.z * gap + lift.z,
    };
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  if (!positions.length) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, activeLineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
  activeLineCount = positions.length / 3;
  activeLineVisible = true;
  activeLineModel = modelMatrix(active.network.transform, { x: 0, y: 0, z: 0 });
}

function renderFrame() {
  if (!gl) return;
  frameHandle = requestAnimationFrame(renderFrame);
  if (!canvasWidth || !canvasHeight) return;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = canvasWidth / Math.max(1, canvasHeight);
  const projection = perspectiveMatrix((43 * Math.PI) / 180, aspect, 0.1, 100);
  const cameraTarget = { x: 0, y: view === 'cliff' ? -0.18 : 0, z: 0 };
  const cosPitch = Math.cos(pitch);
  const eye = {
    x: cameraTarget.x + cameraDistance * cosPitch * Math.sin(yaw),
    y: cameraTarget.y + cameraDistance * Math.sin(pitch),
    z: cameraTarget.z + cameraDistance * cosPitch * Math.cos(yaw),
  };
  const viewProjection = multiplyMatrix(projection, lookAtMatrix(eye, cameraTarget, { x: 0, y: 1, z: 0 }));

  drawBuffers(floorBuffers, translationMatrix(0, groundHeight, 0), viewProjection, '#232925', -1, 0.7);
  for (const record of pieceRecords) {
    const shift = record.piece ? {
      x: record.piece.shift.x * record.gapDistance,
      y: record.piece.shift.y * record.gapDistance,
      z: record.piece.shift.z * record.gapDistance,
    } : { x: 0, y: 0, z: 0 };
    const edgeAlpha = record.isCliff ? 0.52 : 0.82;
    drawBuffers(record.buffers, modelMatrix(record.network.transform, shift), viewProjection, '#221f1d', record.materialType ?? 0, edgeAlpha);
  }
  if (activeLineVisible) drawLineBuffer(activeLineBuffer, activeLineCount, activeLineModel, viewProjection, [0.84, 0.92, 0.57, 0.94]);
}

function drawBuffers(buffers, model, viewProjection, edgeColor, materialType = 0, edgeAlpha = 0.82) {
  gl.useProgram(meshProgram);
  gl.uniformMatrix4fv(meshLocations.model, false, model);
  gl.uniformMatrix4fv(meshLocations.viewProjection, false, viewProjection);
  gl.uniformMatrix3fv(meshLocations.normalMatrix, false, normalMatrix(model));
  gl.uniform3f(meshLocations.lightDirection, -0.48, 0.82, 0.58);
  gl.uniform1f(meshLocations.materialType, materialType);
  gl.uniform1f(meshLocations.surfaceDetail, Number(elements.surfaceDetail.value) / 100);
  bindAttribute(buffers.position, meshLocations.position, 3);
  bindAttribute(buffers.normal, meshLocations.normal, 3);
  bindAttribute(buffers.color, meshLocations.color, 3);
  gl.drawArrays(gl.TRIANGLES, 0, buffers.vertexCount);
  if (buffers.edges && buffers.edgeCount > 0) {
    drawLineBuffer(buffers.edges, buffers.edgeCount, model, viewProjection, [...hexColor(edgeColor), edgeAlpha]);
  }
}

function drawLineBuffer(buffer, count, model, viewProjection, color) {
  if (!count || !buffer) return;
  gl.useProgram(lineProgram);
  gl.uniformMatrix4fv(lineLocations.model, false, model);
  gl.uniformMatrix4fv(lineLocations.viewProjection, false, viewProjection);
  gl.uniform4f(lineLocations.color, color[0], color[1], color[2], color[3]);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(lineLocations.position);
  gl.vertexAttribPointer(lineLocations.position, 3, gl.FLOAT, false, 0, 0);
  gl.lineWidth(1);
  gl.drawArrays(gl.LINES, 0, count);
}

function bindAttribute(buffer, location, itemSize) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, itemSize, gl.FLOAT, false, 0, 0);
}

function normalForFace(points) {
  const a = points[0];
  const b = points[1];
  const c = points[2];
  const first = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const second = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const normal = {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
}

function createProgram(vertexSource, fragmentSource) {
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    throw new Error(`WebGL shader link failed: ${message}`);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    throw new Error(`WebGL shader compile failed: ${message}`);
  }
  return shader;
}

function hexColor(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function initialiseCanvas() {
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvasWrap);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    yaw -= dx * 0.008;
    pitch = clamp(pitch + dy * 0.007, -1.28, 1.28);
  });
  const stopDragging = () => {
    dragging = false;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraDistance = clamp(cameraDistance * Math.exp(event.deltaY * 0.0011), 2.8, view === 'cliff' ? 34 : 9);
  }, { passive: false });
  resizeCanvas();
}

function resizeCanvas() {
  if (!gl) return;
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  canvasWidth = bounds.width;
  canvasHeight = bounds.height;
  bufferPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvasWidth * bufferPixelRatio);
  canvas.height = Math.round(canvasHeight * bufferPixelRatio);
}

function resetCamera() {
  yaw = view === 'cliff' ? 0.42 : 0.68;
  pitch = view === 'cliff' ? 0.22 : 0.34;
  cameraDistance = view === 'cliff' ? 15.8 : 4.35;
}

function setView(nextView) {
  if (view === nextView) return;
  view = nextView;
  const blockActive = view === 'block';
  elements.blockButton.classList.toggle('is-active', blockActive);
  elements.cliffButton.classList.toggle('is-active', !blockActive);
  elements.blockButton.setAttribute('aria-pressed', String(blockActive));
  elements.cliffButton.setAttribute('aria-pressed', String(!blockActive));
  resetCamera();
  rebuild();
}

function scheduleRebuild() {
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(rebuild, 85);
}

function generateNewSeed() {
  elements.seed.value = String(Math.floor(Math.random() * 999999) + 1);
  rebuild();
}

function exportPolyhedra() {
  if (view === 'cliff') {
    exportCliffStl();
    return;
  }
  const options = currentOptions();
  const payload = {
    format: 'field-form.fracture-polyhedra/v2',
    title: 'Sharp 3D polygon-first rock fracture prototype (sealed single mesh)',
    view,
    coordinateSystem: 'right-handed local xyz; y-up; units are normalized rock-space coordinates',
    parameters: options,
    method: 'Sequential orientation-biased plane cuts through a varied 3D rock hull. Opened joints bevel inward to a sealed fissure root so the fractured stone is a single watertight mesh.',
    sdfNote: 'Exported mesh is a closed manifold polygon solid. Convert directly to SDF for downstream hydraulic/thermal erosion.',
    rocks: networks.map((network) => ({
      ...networkToJSON(network),
      rockType: network.rockType ?? options.rockType,
      transform: network.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0] },
    })),
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `fracture-3d-seed-${options.seed}-${options.rockType}.json`);
}

function exportCliffStl() {
  const positions = cliffAssembly?.mesh.positions;
  if (!positions?.length) return;
  const triangleCount = positions.length / 9;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const header = new TextEncoder().encode('FIELD/FORM sharp sealed 3D polygonal cliff shell');
  new Uint8Array(buffer, 0, header.length).set(header);
  const data = new DataView(buffer);
  data.setUint32(80, triangleCount, true);
  let offset = 84;
  for (let index = 0; index < positions.length; index += 9) {
    const abx = positions[index + 3] - positions[index];
    const aby = positions[index + 4] - positions[index + 1];
    const abz = positions[index + 5] - positions[index + 2];
    const acx = positions[index + 6] - positions[index];
    const acy = positions[index + 7] - positions[index + 1];
    const acz = positions[index + 8] - positions[index + 2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const magnitude = Math.hypot(nx, ny, nz) || 1;
    nx /= magnitude; ny /= magnitude; nz /= magnitude;
    data.setFloat32(offset, nx, true); offset += 4;
    data.setFloat32(offset, ny, true); offset += 4;
    data.setFloat32(offset, nz, true); offset += 4;
    for (let component = 0; component < 9; component += 1) {
      data.setFloat32(offset, positions[index + component], true);
      offset += 4;
    }
    data.setUint16(offset, 0, true); offset += 2;
  }
  const { seed, type } = cliffAssembly;
  downloadBlob(new Blob([buffer], { type: 'model/stl' }), `sharp-${type}-cliff-seed-${seed}.stl`);
}

function exportCliffRecipe() {
  if (!cliffAssembly) return;
  const { seed, type, profile, satmap, base, recipe, grooves, summary, grid, grooveWidth, material } = cliffAssembly;
  const payload = {
    format: 'field-form.sealed-cliff-recipe/v2',
    title: profile.name,
    parameters: currentOptions(),
    coordinateSystem: 'right-handed xyz; y-up; normalized units',
    shell: {
      representation: 'watertight 2-manifold polygonal cliff assembly with 3D fractured rocks and sealed joint fissures',
      watertight: true,
      triangles: summary.triangleCount,
      sources: [
        'pronounced 3D low-poly cliff core with headlands, overhangs, and gullies',
        'high-variation 3D fractured rock polyhedra (slab, blocky, jagged, columnar, spire, rubble) with sealed 3D joints',
        'multi-band satellite-derived SatMap geological color ramp',
      ],
      grid,
    },
    baseShape: {
      type: 'seeded low-poly cliff silhouette with pronounced 3D front/back relief and overhangs',
      parameters: base.parameters,
      silhouette: base.silhouette,
      ridge: base.ridge,
      frontSurface: base.frontNodes,
      backSurface: base.backNodes,
      grid: base.grid,
    },
    rockMix: cliffTypeInfo(type).mix,
    satmap,
    material: {
      ...material,
      surfaceDetail: currentOptions().surfaceDetail,
      exportNote: 'The binary STL carries the watertight 3D polygon geometry; this recipe stores per-rock fracture metadata and SatMap colors for downstream SDF erosion.',
    },
    grooves: { count: grooves.length, width: grooveWidth, segments: grooves.map(({ a, b, normal }) => ({ a, b, normal })) },
    rockRecipe: recipe,
    summary,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `cliff-recipe-seed-${seed}-${type}.json`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleRangeInput() {
  pausePlayback();
  setProgress(Number(elements.growth.value));
}

function handleSeedKey(event) {
  if (event.key === 'Enter') rebuild();
}

function identityMatrix() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function multiplyMatrix(a, b) {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return output;
}

function translationMatrix(x, y, z) {
  const matrix = identityMatrix();
  matrix[12] = x;
  matrix[13] = y;
  matrix[14] = z;
  return matrix;
}

function rotationX(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1]);
}
function rotationY(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1]);
}
function rotationZ(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function modelMatrix(transform, shift) {
  const position = transform?.position ?? [0, 0, 0];
  const rotation = transform?.rotation ?? [0, 0, 0];
  let matrix = translationMatrix(position[0], position[1], position[2]);
  matrix = multiplyMatrix(matrix, rotationY(rotation[1]));
  matrix = multiplyMatrix(matrix, rotationX(rotation[0]));
  matrix = multiplyMatrix(matrix, rotationZ(rotation[2]));
  matrix = multiplyMatrix(matrix, translationMatrix(shift.x, shift.y, shift.z));
  return matrix;
}

function normalMatrix(matrix) {
  return new Float32Array([
    matrix[0], matrix[1], matrix[2],
    matrix[4], matrix[5], matrix[6],
    matrix[8], matrix[9], matrix[10],
  ]);
}

function perspectiveMatrix(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  const output = new Float32Array(16);
  output[0] = f / aspect;
  output[5] = f;
  output[10] = (far + near) * range;
  output[11] = -1;
  output[14] = 2 * far * near * range;
  return output;
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function crossVector(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function dotVector(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

function lookAtMatrix(eye, target, up) {
  const zAxis = normalizeVector({ x: eye.x - target.x, y: eye.y - target.y, z: eye.z - target.z });
  const xAxis = normalizeVector(crossVector(up, zAxis));
  const yAxis = crossVector(zAxis, xAxis);
  return new Float32Array([
    xAxis.x, yAxis.x, zAxis.x, 0,
    xAxis.y, yAxis.y, zAxis.y, 0,
    xAxis.z, yAxis.z, zAxis.z, 0,
    -dotVector(xAxis, eye), -dotVector(yAxis, eye), -dotVector(zAxis, eye), 1,
  ]);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

elements.blockButton.addEventListener('click', () => setView('block'));
elements.cliffButton.addEventListener('click', () => setView('cliff'));
elements.density.addEventListener('input', () => { updateLabels(); scheduleRebuild(); });
elements.wander.addEventListener('input', () => { updateLabels(); scheduleRebuild(); });
elements.angle.addEventListener('input', () => { updateLabels(); scheduleRebuild(); });
elements.cliffType.addEventListener('change', () => { updateLabels(); scheduleRebuild(); });
if (elements.rockType) elements.rockType.addEventListener('change', () => { updateLabels(); rebuild(); });
if (elements.satmap) elements.satmap.addEventListener('change', () => { updateLabels(); scheduleRebuild(); });
elements.cliffContour.addEventListener('input', () => { updateLabels(); scheduleRebuild(); });
elements.cliffRelief.addEventListener('input', () => { updateLabels(); scheduleRebuild(); });
elements.surfaceDetail.addEventListener('input', updateLabels);
elements.gap.addEventListener('input', () => {
  updateLabels();
  if (view === 'cliff') scheduleRebuild();
  else {
    mountVisiblePieces(false);
    updateActiveCrack();
  }
});
elements.seed.addEventListener('change', rebuild);
elements.seed.addEventListener('keydown', handleSeedKey);
elements.randomSeed.addEventListener('click', generateNewSeed);
elements.generate.addEventListener('click', rebuild);
elements.play.addEventListener('click', togglePlayback);
elements.growth.addEventListener('input', handleRangeInput);
elements.export.addEventListener('click', exportPolyhedra);
elements.exportRecipe.addEventListener('click', exportCliffRecipe);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pausePlayback();
});

updateLabels();
