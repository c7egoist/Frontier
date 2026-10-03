import {
  generateFractureNetwork,
  makeRockPolyhedron,
  networkToJSON,
  polyhedronVertices,
} from './fracture-core.js';
import { buildCliffMesh, cliffTypeInfo } from './cliff-core.js';

const canvas = document.querySelector('#fracture-canvas');
const canvasWrap = document.querySelector('#canvas-wrap');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });

const elements = {
  blockButton: document.querySelector('#block-view-button'),
  cliffButton: document.querySelector('#cliff-view-button'),
  stageTitle: document.querySelector('#stage-title'),
  canvasMode: document.querySelector('#canvas-mode-label'),
  overlayLabel: document.querySelector('#overlay-label'),
  overlayCoordinate: document.querySelector('#overlay-coordinate'),
  cliffType: document.querySelector('#cliff-type-select'),
  cliffTypeGroup: document.querySelector('#cliff-type-group'),
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
    float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);
    float light = 0.54 + 0.64 * diffuse;
    float detail = clamp(uSurfaceDetail, 0.0, 1.0);
    float height = smoothstep(-4.2, 3.5, vWorldPosition.y);
    float exposure = 0.87 + 0.16 * height + 0.035 * max(normal.y, 0.0);
    vec3 color = vColor * exposure;
    float stamp = 0.0;

    if (uMaterialType >= -0.5 && uMaterialType < 0.5) {
      // A few broad mineral seams: directional structure, not stochastic noise.
      float phase = dot(vWorldPosition, vec3(0.72, 0.19, 0.67)) * 5.8;
      phase += 0.24 * sin(vWorldPosition.y * 1.7 + vWorldPosition.z * 0.8);
      stamp = -0.12 * narrowStamp(phase, 18.0) + 0.035 * sin(phase * 0.38);
    } else if (uMaterialType >= 0.5 && uMaterialType < 1.5) {
      // Fine bedding seams with gently bent beds and pale inter-layer bands.
      float phase = vWorldPosition.y * 7.6;
      phase += 0.26 * sin(vWorldPosition.x * 0.58) + 0.12 * sin(vWorldPosition.z * 0.9);
      float seam = narrowStamp(phase, 24.0);
      float halo = narrowStamp(phase - 0.30, 5.0);
      stamp = -0.15 * seam + 0.055 * halo;
    } else if (uMaterialType >= 1.5 && uMaterialType < 2.5) {
      // Basalt's long column faces and sparse cross-joint staining.
      float columnPhase = vWorldPosition.x * 8.4 + 0.25 * sin(vWorldPosition.z * 1.4);
      float columnSeam = narrowStamp(columnPhase, 16.0);
      float crossJoint = narrowStamp(vWorldPosition.y * 3.4 + 0.15 * sin(vWorldPosition.x), 22.0);
      stamp = -0.13 * columnSeam - 0.08 * crossJoint;
    } else if (uMaterialType >= 2.5) {
      // Breccia gets sparse diagonal mineral veins, independent of the block layout.
      float phase = dot(vWorldPosition, vec3(0.64, 0.28, 0.72)) * 6.2;
      phase += 0.22 * sin(vWorldPosition.y * 1.2 + vWorldPosition.x * 0.36);
      stamp = -0.15 * narrowStamp(phase, 20.0) + 0.025 * sin(phase * 0.31);
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
let yaw = 0.72;
let pitch = 0.36;
let cameraDistance = 5.4;
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
  gl.clearColor(32 / 255, 39 / 255, 36 / 255, 1);
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
    cliffContour: Number(elements.cliffContour.value),
    cliffRelief: Number(elements.cliffRelief.value),
    surfaceDetail: Number(elements.surfaceDetail.value),
  };
}

function updateSliderFills() {
  [elements.density, elements.wander, elements.angle, elements.gap, elements.cliffContour, elements.cliffRelief, elements.surfaceDetail].forEach((slider) => {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const value = Number(slider.value);
    const percent = ((value - min) / (max - min)) * 100;
    slider.style.setProperty('--range-progress', `${percent}%`);
  });
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
  elements.densityLabel.textContent = view === 'cliff' ? 'Rock packing' : 'Fracture density';
  elements.gapLabel.textContent = view === 'cliff' ? 'Sealed joint relief' : 'Joint opening';
  const formation = cliffTypeInfo(elements.cliffType.value);
  elements.cliffTypeDescription.textContent = formation.description;
  elements.cliffRockMix.textContent = formation.mix;
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
    elements.canvasMode.textContent = 'ONE SEALED MESH · SDF UNION';
    const minY = minimumMeshY(cliffAssembly.mesh.positions);
    groundHeight = minY - 0.025;
  } else {
    cliffAssembly = null;
    const outline = makeRockPolyhedron(options.seed, { x: 1.17, y: 1.12, z: 0.96 });
    networks = [{
      ...generateFractureNetwork(outline, options),
      transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
    }];
    elements.stageTitle.textContent = 'Single fractured rock volume';
    elements.canvasMode.textContent = '3 AXES · DRAG TO ORBIT';
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
  elements.cliffBaseControls.hidden = !isCliff;
  elements.play.disabled = isCliff;
  elements.growth.disabled = isCliff;
  elements.play.setAttribute('aria-label', isCliff ? 'Static cliff assembly' : 'Replay crack propagation');
  elements.generate.querySelector('span:first-child').textContent = isCliff ? 'Rebuild sealed cliff' : 'Generate fractures';
  elements.exportLabel.textContent = isCliff ? 'EXPORT SEALED CLIFF STL' : 'EXPORT FRACTURE POLYGONS JSON';
  elements.exportRecipe.hidden = !isCliff;
  elements.densityLabel.textContent = isCliff ? 'Rock packing' : 'Fracture density';
  elements.gapLabel.textContent = isCliff ? 'Sealed joint relief' : 'Joint opening';
  elements.timelineLabel.textContent = isCliff ? 'SEALED CLIFF ASSEMBLY' : '3D FRACTURE SEQUENCE';
  elements.timelineStart.textContent = isCliff ? 'UNION' : 'NUCLEATION';
  elements.timelineEnd.textContent = isCliff ? 'ONE CLOSED SHELL' : 'ARREST / ABUTMENT';
  elements.growth.setAttribute('aria-label', isCliff ? 'Timeline is not used for the fused cliff mesh' : 'Scrub the three-dimensional fracture propagation sequence');
  elements.densityLow.textContent = isCliff ? 'LOOSE' : 'SPARSE';
  elements.densityHigh.textContent = isCliff ? 'PACKED' : 'CONNECTED';
  elements.gapLow.textContent = isCliff ? 'SUBTLE' : 'CLOSED';
  elements.gapHigh.textContent = isCliff ? 'DEEPER GROOVES' : 'WIDEN TO INSPECT';
  elements.growthLegend.hidden = isCliff;
  elements.overlayLabel.textContent = isCliff ? 'POLYGON-FIRST ROCKS / FUSED FIELD' : 'ONE ROCK / POLYHEDRAL CUTS';
  elements.overlayCoordinate.innerHTML = isCliff
    ? 'TRUE 3D <span>·</span> SEALED JOINTS <span>·</span> NO CRACK MAPS'
    : 'TRUE 3D <span>·</span> CLOSED FRAGMENTS <span>·</span> NO CRACK MAPS';
  canvas.setAttribute('aria-label', isCliff
    ? 'Interactive three-dimensional cliff formed from sealed polygonal rock geometry'
    : 'Interactive three-dimensional rock split into closed polygonal fracture fragments');
  elements.playLabel.textContent = isCliff ? 'Static cliff shell' : 'Replay growth';
  elements.blockButton.classList.toggle('is-active', !isCliff);
  elements.cliffButton.classList.toggle('is-active', isCliff);
  elements.blockButton.setAttribute('aria-pressed', String(!isCliff));
  elements.cliffButton.setAttribute('aria-pressed', String(isCliff));
  elements.methodHeading.innerHTML = isCliff
    ? 'A sealed cliff shell.<br />Built from 3D rock forms.'
    : 'Plane cuts in 3D.<br />Not 2D extrusions.';
  elements.methodCopy.textContent = isCliff
    ? 'A seeded low-poly cliff body supplies a curved ridge, scalloped sides, and faceted depth. Variable-size rocks fuse into one closed mesh, shaded with height, curvature, ambient occlusion, and structured geological stamps—not random texture noise or crack maps.'
    : 'A convex rock volume is cut by oriented planes one at a time. Each cut adds a shared polygonal face and produces two closed polyhedra; later cuts can terminate against older joints. Directional mineral marks add material character; joints stay geometric, with no crack maps or cell seeding.';
  elements.methodCaveat.textContent = isCliff
    ? 'A geometric union prototype; the rock recipe preserves individual forms, palettes, and material settings for later SDF erosion.'
    : 'True 3D mesh prototype; plane-growth heuristic, not a full elastic stress / LEFM solver.';
}

function updateStats() {
  if (view === 'cliff' && cliffAssembly) {
    elements.fractureCount.textContent = String(cliffAssembly.summary.jointTraces).padStart(2, '0');
    elements.fragmentCount.textContent = String(cliffAssembly.summary.rockCount).padStart(2, '0');
    elements.generationCount.textContent = '01';
    elements.statLabels[0].textContent = 'SEALED JOINTS';
    elements.statLabels[1].textContent = 'ROCK FORMS';
    elements.statLabels[2].textContent = 'CLOSED MESH';
    return;
  }
  const fractureCount = networks.reduce((sum, network) => sum + network.events.length, 0);
  const fragmentCount = networks.reduce((sum, network) => sum + network.finalPieces.length, 0);
  const generations = new Set(networks.flatMap((network) => network.events.map((event) => event.generation))).size;
  elements.fractureCount.textContent = String(fractureCount).padStart(2, '0');
  elements.fragmentCount.textContent = String(fragmentCount).padStart(2, '0');
  elements.generationCount.textContent = String(generations).padStart(2, '0');
  elements.statLabels[0].textContent = 'JOINT PLANES';
  elements.statLabels[1].textContent = 'POLYHEDRA';
  elements.statLabels[2].textContent = 'SETS';
}

function updateGrowthReadout() {
  if (view === 'cliff' && cliffAssembly) {
    elements.growthReadout.textContent = `SEALED SHELL / ${Math.round(cliffAssembly.mesh.triangleCount / 1000)}K TRIANGLES`;
    return;
  }
  if (progress >= totalEvents || totalEvents === 0) {
    elements.growthReadout.textContent = `ALL JOINTS / ${totalEvents}`;
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
    const stateKey = `cliff:${cliffAssembly?.mesh.vertexCount ?? 0}:${cliffAssembly?.summary.triangleCount ?? 0}`;
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
        buffers: createCliffBuffers(mesh),
      });
      // The GPU buffers now own the render data; keep only light recipe metadata in JS.
      mesh.normals = null;
      mesh.colors = null;
    }
    return;
  }

  const stateKey = networks.map((network, index) => {
    const local = clamp(progress - eventOffsets[index], 0, network.events.length);
    return Math.min(network.events.length, Math.floor(local + 1e-7));
  }).join(',');
  if (!force && stateKey === currentStateKey) {
    updateOpeningOffsets();
    return;
  }

  for (const record of pieceRecords) disposePieceBuffers(record.buffers);
  pieceRecords = [];
  currentStateKey = stateKey;

  networks.forEach((network, networkIndex) => {
    const local = clamp(progress - eventOffsets[networkIndex], 0, network.events.length);
    const completed = Math.min(network.events.length, Math.floor(local + 1e-7));
    const pieces = network.states[Math.min(completed, network.states.length - 1)] ?? network.finalPieces;
    pieces.forEach((piece, pieceIndex) => {
      pieceRecords.push({ network, networkIndex, piece, pieceIndex, buffers: createPieceBuffers(piece, networkIndex, pieceIndex) });
    });
  });
  updateOpeningOffsets();
}

function updateOpeningOffsets() {
  if (view === 'cliff') return;
  // Piece shifts are stored as signed sums of cut-plane normals; this slider
  // converts that topology into a small, inspectable physical aperture.
  pieceRecords.forEach((record) => {
    record.gapDistance = gapDistance(record.network);
  });
}

function cliffMaterialType(type) {
  return ({ layered: 1, basalt: 2, breccia: 3 })[type] ?? 0;
}

function gapDistance(network) {
  const vertices = polyhedronVertices(network.outline);
  const extent = Math.max(...vertices.map((point) => Math.hypot(point.x, point.y, point.z)));
  const opening = Number(elements.gap.value) / 100;
  return extent * opening * 0.028;
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
  return Number.isFinite(lowest) ? lowest - 0.025 : -1;
}

function makeMeshColor(face, networkIndex, pieceIndex) {
  if (face.kind === 'fracture') return hexColor('#454a43');
  const palette = ['#858477', '#817f73', '#888679', '#7c8077', '#85887d', '#818074'];
  const base = hexColor(palette[networkIndex % palette.length]);
  const tint = 0.91 + face.tone * 0.12 + (pieceIndex % 4) * 0.012;
  return base.map((channel) => clamp(channel * tint, 0, 1));
}

function createCliffBuffers(mesh) {
  return {
    vertexCount: mesh.vertexCount,
    position: uploadBuffer(mesh.positions, gl.ARRAY_BUFFER),
    normal: uploadBuffer(mesh.normals, gl.ARRAY_BUFFER),
    color: uploadBuffer(mesh.colors, gl.ARRAY_BUFFER),
    edgeCount: 0,
    edges: null,
  };
}

function minimumMeshY(positions) {
  let minimum = Infinity;
  for (let index = 1; index < positions.length; index += 3) minimum = Math.min(minimum, positions[index]);
  return Number.isFinite(minimum) ? minimum : -1;
}

function createPieceBuffers(piece, networkIndex, pieceIndex) {
  const positions = [];
  const normals = [];
  const colors = [];
  const edges = [];

  for (const face of piece.faces) {
    if (face.points.length < 3) continue;
    const normal = normalForFace(face.points);
    const color = makeMeshColor(face, networkIndex, pieceIndex);
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
    [-10, 0, -10], [-10, 0, 10], [10, 0, 10],
    [-10, 0, -10], [10, 0, 10], [10, 0, -10],
  ];
  const positions = [];
  const normals = [];
  const colors = [];
  for (const [x, y, z] of corners) {
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    colors.push(...hexColor('#303732'));
  }
  const edges = [
    -10, 0.001, -10, 10, 0.001, -10,
    10, 0.001, -10, 10, 0.001, 10,
    10, 0.001, 10, -10, 0.001, 10,
    -10, 0.001, 10, -10, 0.001, -10,
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
  gl.deleteBuffer(buffers.edges);
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
  const cameraTarget = { x: 0, y: view === 'cliff' ? -0.08 : 0, z: 0 };
  const cosPitch = Math.cos(pitch);
  const eye = {
    x: cameraTarget.x + cameraDistance * cosPitch * Math.sin(yaw),
    y: cameraTarget.y + cameraDistance * Math.sin(pitch),
    z: cameraTarget.z + cameraDistance * cosPitch * Math.cos(yaw),
  };
  const viewProjection = multiplyMatrix(projection, lookAtMatrix(eye, cameraTarget, { x: 0, y: 1, z: 0 }));

  drawBuffers(floorBuffers, translationMatrix(0, groundHeight, 0), viewProjection, '#252b27', -1);
  for (const record of pieceRecords) {
    const shift = record.piece ? {
      x: record.piece.shift.x * record.gapDistance,
      y: record.piece.shift.y * record.gapDistance,
      z: record.piece.shift.z * record.gapDistance,
    } : { x: 0, y: 0, z: 0 };
    drawBuffers(record.buffers, modelMatrix(record.network.transform, shift), viewProjection, '#303631', record.materialType ?? 0);
  }
  if (activeLineVisible) drawLineBuffer(activeLineBuffer, activeLineCount, activeLineModel, viewProjection, [0.84, 0.92, 0.57, 0.94]);
}

function drawBuffers(buffers, model, viewProjection, edgeColor, materialType = 0) {
  gl.useProgram(meshProgram);
  gl.uniformMatrix4fv(meshLocations.model, false, model);
  gl.uniformMatrix4fv(meshLocations.viewProjection, false, viewProjection);
  gl.uniformMatrix3fv(meshLocations.normalMatrix, false, normalMatrix(model));
  gl.uniform3f(meshLocations.lightDirection, -0.45, 0.84, 0.56);
  gl.uniform1f(meshLocations.materialType, materialType);
  gl.uniform1f(meshLocations.surfaceDetail, Number(elements.surfaceDetail.value) / 100);
  bindAttribute(buffers.position, meshLocations.position, 3);
  bindAttribute(buffers.normal, meshLocations.normal, 3);
  bindAttribute(buffers.color, meshLocations.color, 3);
  gl.drawArrays(gl.TRIANGLES, 0, buffers.vertexCount);
  drawLineBuffer(buffers.edges, buffers.edgeCount, model, viewProjection, [...hexColor(edgeColor), 0.86]);
}

function drawLineBuffer(buffer, count, model, viewProjection, color) {
  if (!count) return;
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
    cameraDistance = clamp(cameraDistance * Math.exp(event.deltaY * 0.0011), 3.2, view === 'cliff' ? 34 : 9);
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
  yaw = 0.72;
  pitch = 0.36;
  cameraDistance = view === 'cliff' ? 16.8 : 4.45;
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
  rebuildTimer = window.setTimeout(rebuild, 110);
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
    format: 'field-form.fracture-polyhedra/v1',
    title: '3D polygon-first rock fracture prototype',
    view,
    coordinateSystem: 'right-handed local xyz; y-up; units are normalized rock-space coordinates',
    parameters: options,
    method: 'Sequential orientation-biased plane cuts through a convex 3D rock hull. Each cut creates a shared polygon fracture face and two closed polyhedra. No crack maps, Voronoi sites, or prefractured cells.',
    sdfNote: 'Exported fragments are closed polygon-faced solids. Union or field-convert the fragment meshes, then apply erosion in the downstream SDF stage.',
    rocks: networks.map((network) => ({
      ...networkToJSON(network),
      transform: network.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0] },
    })),
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `fracture-3d-seed-${options.seed}-rock.json`);
}

function exportCliffStl() {
  const positions = cliffAssembly?.mesh.positions;
  if (!positions?.length) return;
  const triangleCount = positions.length / 9;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const header = new TextEncoder().encode('FIELD/FORM sealed polygonized SDF cliff shell');
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
  downloadBlob(new Blob([buffer], { type: 'model/stl' }), `sealed-${type}-cliff-seed-${seed}.stl`);
}

function exportCliffRecipe() {
  if (!cliffAssembly) return;
  const { seed, type, profile, base, recipe, grooves, summary, grid, grooveWidth, material } = cliffAssembly;
  const payload = {
    format: 'field-form.sealed-cliff-recipe/v1',
    title: profile.name,
    parameters: currentOptions(),
    coordinateSystem: 'right-handed xyz; y-up; normalized units',
    shell: {
      representation: 'closed triangulated isosurface of a fused signed-distance field',
      watertight: true,
      triangles: summary.triangleCount,
      sources: ['seeded low-poly cliff base with faceted front/back relief', 'overlapping convex rock forms with per-rock color palettes', 'sealed shallow joint grooves'],
      grid,
    },
    baseShape: {
      type: 'seeded low-poly cliff silhouette with triangulated front and back height fields',
      parameters: base.parameters,
      silhouette: base.silhouette,
      ridge: base.ridge,
      frontSurface: base.frontNodes,
      backSurface: base.backNodes,
      grid: base.grid,
    },
    rockMix: cliffTypeInfo(type).mix,
    material: {
      ...material,
      surfaceDetail: currentOptions().surfaceDetail,
      exportNote: 'The binary STL carries geometry only; this recipe stores the per-rock base colors and structured shading settings.',
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
elements.cliffContour.addEventListener('input', () => { updateLabels(); scheduleRebuild(); });
elements.cliffRelief.addEventListener('input', () => { updateLabels(); scheduleRebuild(); });
elements.surfaceDetail.addEventListener('input', updateLabels);
elements.gap.addEventListener('input', () => {
  updateLabels();
  if (view === 'cliff') scheduleRebuild();
  else {
    updateOpeningOffsets();
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
