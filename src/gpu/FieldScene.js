import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  DOMAIN_MAX,
  DOMAIN_MIN,
  FIELD_MODES,
  MODE_INDEX,
  terrainHeight,
} from '../core/fields.js';
import {
  ARROW_FRAGMENT,
  ARROW_VERTEX,
  COMPUTE_FRAGMENT,
  COMPUTE_VERTEX,
  COPY_FRAGMENT,
  POINTS_FRAGMENT,
  POINTS_VERTEX,
  RAIN_FRAGMENT,
  RAIN_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  TRAILS_FRAGMENT,
  TRAILS_VERTEX,
  VEGETATION_FRAGMENT,
  VEGETATION_VERTEX,
} from './shaders.js';

export const QUALITY_LEVELS = {
  low: {
    label: 'Low', particleSize: 64, glyphGrid: [18, 5, 18], terrainSegments: 96,
    rainCount: 300, vegetationCount: 420,
  },
  balanced: {
    label: 'Balanced', particleSize: 112, glyphGrid: [26, 7, 26], terrainSegments: 160,
    rainCount: 650, vegetationCount: 820,
  },
  high: {
    label: 'High', particleSize: 144, glyphGrid: [32, 9, 32], terrainSegments: 200,
    rainCount: 950, vegetationCount: 1150,
  },
  ultra: {
    label: 'Ultra', particleSize: 176, glyphGrid: [38, 11, 38], terrainSegments: 240,
    rainCount: 1300, vegetationCount: 1400,
  },
};

const MAX_DECORATIONS = 1400;
const PARTICLE_LIFE = 9.0;
const BACKGROUND = new THREE.Color('#05090b');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMaterial(uniforms, vertexShader, fragmentShader, options = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    transparent: options.transparent ?? true,
    depthTest: options.depthTest ?? true,
    depthWrite: options.depthWrite ?? false,
    blending: options.blending ?? THREE.AdditiveBlending,
    side: options.side ?? THREE.DoubleSide,
    toneMapped: false,
  });
}

function dummyDataTexture() {
  const texture = new THREE.Data3DTexture(new Float32Array(2 * 2 * 2 * 4), 2, 2, 2);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.FloatType;
  texture.internalFormat = 'RGBA32F';
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function particleUv(size) {
  const uvs = new Float32Array(size * size * 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 2;
      uvs[index] = (x + 0.5) / size;
      uvs[index + 1] = (y + 0.5) / size;
    }
  }
  return uvs;
}

export class FieldScene {
  constructor(canvas, { quality = 'balanced', onFrame = () => {}, onStatus = () => {} } = {}) {
    this.canvas = canvas;
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.activeModeId = 'wind';
    this.activeDataset = null;
    this.activeQualityId = QUALITY_LEVELS[quality] ? quality : 'balanced';
    this.needsParticleReset = true;
    this.frameCount = 0;
    this.frameAccumulator = 0;
    this.lastFps = 60;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!this.renderer.capabilities.isWebGL2) {
      throw new Error('WebGL2 is required for the GPU field renderer.');
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(BACKGROUND, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    const gl = this.renderer.getContext();
    this.computeAvailable = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.dummyTexture = dummyDataTexture();

    this.uniforms = {
      uMode: { value: MODE_INDEX.wind },
      uScalarMode: { value: 0 },
      uTime: { value: 8 },
      uFieldScale: { value: 1 },
      uDataScale: { value: 1 },
      uTerrainAmp: { value: FIELD_MODES[0].amplitude },
      uBoundsMin: { value: new THREE.Vector3(...DOMAIN_MIN) },
      uBoundsMax: { value: new THREE.Vector3(...DOMAIN_MAX) },
      uDataTex: { value: this.dummyTexture },
      uDataDims: { value: new THREE.Vector3(2, 2, 2) },
      uDataBoundsMin: { value: new THREE.Vector3(-1, -1, -1) },
      uDataBoundsMax: { value: new THREE.Vector3(1, 1, 1) },
      uDataScalarRange: { value: new THREE.Vector2(0, 1) },
      uGlyphScale: { value: 1 },
      uSliceY: { value: 5 },
      uSliceWidth: { value: 1.1 },
      uSliceEnabled: { value: 0 },
      uGlyphOpacity: { value: 0.92 },
      uTerrainOpacity: { value: 1 },
      uShowGrid: { value: 1 },
      uShowContours: { value: 1 },
      uShowRain: { value: 0 },
      uShowVegetation: { value: 0 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uParticleLife: { value: PARTICLE_LIFE },
      uPointOpacity: { value: 0.95 },
      uTrailOpacity: { value: 0.52 },
      uTrailLength: { value: 1.2 },
      uDelta: { value: 0 },
      uTracerRate: { value: 1 },
      uReset: { value: 0 },
      uSeed: { value: 0.314 },
      uState: { value: null },
      uPositionTexture: { value: null },
      uSpawnTexture: { value: null },
      uGlyphAdvection: { value: 1 },
      uProceduralGlyphMotion: { value: 0 },
      uRainOpacity: { value: 0.5 },
      uVegetationOpacity: { value: 0.58 },
    };

    this.scene = new THREE.Scene();
    this.scene.background = BACKGROUND;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
    this.camera.position.set(24, 18, 28);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 72;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.addEventListener('start', () => { this.cameraGoal = null; });

    this.raycaster = new THREE.Raycaster();
    this.probePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.materials = {
      arrow: createMaterial(this.uniforms, ARROW_VERTEX, ARROW_FRAGMENT),
      terrain: createMaterial(this.uniforms, TERRAIN_VERTEX, TERRAIN_FRAGMENT, {
        transparent: false,
        depthWrite: true,
        blending: THREE.NormalBlending,
      }),
      points: createMaterial(this.uniforms, POINTS_VERTEX, POINTS_FRAGMENT),
      trails: createMaterial(this.uniforms, TRAILS_VERTEX, TRAILS_FRAGMENT),
      rain: createMaterial(this.uniforms, RAIN_VERTEX, RAIN_FRAGMENT),
      vegetation: createMaterial(this.uniforms, VEGETATION_VERTEX, VEGETATION_FRAGMENT, {
        blending: THREE.NormalBlending,
      }),
      compute: createMaterial(this.uniforms, COMPUTE_VERTEX, COMPUTE_FRAGMENT, {
        transparent: false,
        depthTest: false,
        depthWrite: false,
      }),
    };
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { uInitial: { value: null } },
      vertexShader: COMPUTE_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
    });

    this.setupLights();
    this.setupEnvironment();
    this.setupTerrain();
    this.setupGlyphs();
    this.setupDecorations();
    this.setupObstacles();
    this.setupProbe();
    this.setupComputeScenes();
    this.rebuildGlyphPositions();
    this.rebuildParticleResources(QUALITY_LEVELS[this.activeQualityId]);
    this.applyLayerVisibility({
      layers: {
        terrain: true, glyphs: true, animatedGlyphs: true, tracers: true, rain: true,
        vegetation: true, grid: true, contours: true, obstacles: true,
      },
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.emitStatus();
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0x9fcbbc, 0x07100f, 0.85));
    const key = new THREE.DirectionalLight(0xe4fbe8, 1.35);
    key.position.set(10, 20, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4aa8c8, 0.55);
    rim.position.set(-12, 8, -14);
    this.scene.add(rim);
  }

  setupEnvironment() {
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(32, 14, 32)),
      new THREE.LineBasicMaterial({ color: 0x54857c, transparent: true, opacity: 0.20 }),
    );
    box.position.y = 7;
    box.renderOrder = 1;
    this.domainBox = box;
    this.scene.add(box);

    const grid = new THREE.GridHelper(32, 16, 0x3a6f68, 0x183633);
    grid.position.y = -0.08;
    grid.material.transparent = true;
    grid.material.opacity = 0.16;
    grid.material.depthWrite = false;
    grid.renderOrder = 0;
    this.floorGrid = grid;
    this.scene.add(grid);
  }

  setupTerrain() {
    const segments = QUALITY_LEVELS[this.activeQualityId].terrainSegments;
    const geometry = new THREE.PlaneGeometry(32, 32, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    this.terrain = new THREE.Mesh(geometry, this.materials.terrain);
    this.terrain.frustumCulled = false;
    this.terrain.renderOrder = 0;
    this.scene.add(this.terrain);
  }

  rebuildTerrain(segments) {
    const geometry = new THREE.PlaneGeometry(32, 32, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    this.terrain.geometry.dispose();
    this.terrain.geometry = geometry;
  }

  setupGlyphs() {
    const shaft = new THREE.CylinderGeometry(0.022, 0.022, 0.72, 5, 1, false);
    shaft.translate(0, -0.14, 0);
    const head = new THREE.ConeGeometry(0.095, 0.28, 7, 1, false);
    head.translate(0, 0.36, 0);
    const merged = mergeGeometries([shaft, head], false);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(merged.index);
    for (const [name, attribute] of Object.entries(merged.attributes)) {
      geometry.setAttribute(name, attribute);
    }
    geometry.instanceCount = 0;
    this.arrowGeometry = geometry;
    this.arrows = new THREE.Mesh(geometry, this.materials.arrow);
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 3;
    this.scene.add(this.arrows);
  }

  rebuildGlyphPositions() {
    const quality = QUALITY_LEVELS[this.activeQualityId];
    const [nx, ny, nz] = quality.glyphGrid;
    const count = nx * ny * nz;
    const particleSize = quality.particleSize;
    const particleCount = particleSize * particleSize;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const particleUvs = new Float32Array(count * 2);
    const rng = mulberry32(9137 + MODE_INDEX[this.activeModeId] * 101);
    const mode = FIELD_MODES.find((entry) => entry.id === this.activeModeId) || FIELD_MODES[0];
    const customBounds = this.activeModeId === 'custom' && this.activeDataset
      ? this.activeDataset.bounds
      : null;
    const minX = customBounds?.min[0] ?? -14;
    const maxX = customBounds?.max[0] ?? 14;
    const minZ = customBounds?.min[2] ?? -14;
    const maxZ = customBounds?.max[2] ?? 14;
    const minY = customBounds?.min[1] ?? 0.8;
    const maxY = customBounds?.max[1] ?? 12;
    let index = 0;
    for (let iz = 0; iz < nz; iz += 1) {
      const fz = nz <= 1 ? 0.5 : iz / (nz - 1);
      for (let iy = 0; iy < ny; iy += 1) {
        const fy = ny <= 1 ? 0.5 : iy / (ny - 1);
        for (let ix = 0; ix < nx; ix += 1) {
          const fx = nx <= 1 ? 0.5 : ix / (nx - 1);
          const cellX = (maxX - minX) / Math.max(1, nx - 1);
          const cellZ = (maxZ - minZ) / Math.max(1, nz - 1);
          const x = minX + (maxX - minX) * fx + (rng() - 0.5) * cellX * 0.32;
          const z = minZ + (maxZ - minZ) * fz + (rng() - 0.5) * cellZ * 0.32;
          let y;
          if (this.activeModeId === 'terrain') {
            y = terrainHeight(x, z, mode.amplitude) + 0.45 + fy * 5.0;
          } else {
            y = minY + (maxY - minY) * fy;
          }
          positions[index * 3] = x;
          positions[index * 3 + 1] = y;
          positions[index * 3 + 2] = z;
          seeds[index] = rng();
          const particleIndex = Math.min(particleCount - 1, Math.floor(index * particleCount / count));
          particleUvs[index * 2] = ((particleIndex % particleSize) + 0.5) / particleSize;
          particleUvs[index * 2 + 1] = (Math.floor(particleIndex / particleSize) + 0.5) / particleSize;
          index += 1;
        }
      }
    }
    this.arrowGeometry.setAttribute('aGridPos', new THREE.InstancedBufferAttribute(positions, 3));
    this.arrowGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.arrowGeometry.setAttribute('aParticleUv', new THREE.InstancedBufferAttribute(particleUvs, 2));
    this.arrowGeometry.instanceCount = count;
    this.glyphCount = count;
    this.emitStatus();
  }

  setupDecorations() {
    const rng = mulberry32(5521);
    const offsets = new Float32Array(MAX_DECORATIONS * 2);
    const seeds = new Float32Array(MAX_DECORATIONS);
    for (let i = 0; i < MAX_DECORATIONS; i += 1) {
      offsets[i * 2] = -15 + rng() * 30;
      offsets[i * 2 + 1] = -15 + rng() * 30;
      seeds[i] = rng();
    }
    const offsetAttribute = new THREE.InstancedBufferAttribute(offsets, 2);
    const seedAttribute = new THREE.InstancedBufferAttribute(seeds, 1);

    const rainBase = new THREE.BufferGeometry();
    rainBase.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      0, -0.62, 0,
    ], 3));
    const rainGeometry = new THREE.InstancedBufferGeometry();
    rainGeometry.setAttribute('position', rainBase.getAttribute('position'));
    rainGeometry.setAttribute('aOffset', offsetAttribute);
    rainGeometry.setAttribute('aSeed', seedAttribute);
    rainGeometry.instanceCount = QUALITY_LEVELS[this.activeQualityId].rainCount;
    this.rainGeometry = rainGeometry;
    this.rain = new THREE.LineSegments(rainGeometry, this.materials.rain);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.rain.visible = false;
    this.scene.add(this.rain);

    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.055, 0, 0, 0.055, 0, 0, 0, 1, 0,
      0, 0, -0.055, 0, 0, 0.055, 0, 0.86, 0,
    ], 3));
    const vegetationGeometry = new THREE.InstancedBufferGeometry();
    vegetationGeometry.setAttribute('position', blade.getAttribute('position'));
    vegetationGeometry.setAttribute('aOffset', offsetAttribute.clone());
    vegetationGeometry.setAttribute('aSeed', seedAttribute.clone());
    vegetationGeometry.instanceCount = QUALITY_LEVELS[this.activeQualityId].vegetationCount;
    this.vegetationGeometry = vegetationGeometry;
    this.vegetation = new THREE.Mesh(vegetationGeometry, this.materials.vegetation);
    this.vegetation.frustumCulled = false;
    this.vegetation.renderOrder = 3;
    this.vegetation.visible = false;
    this.scene.add(this.vegetation);
  }

  setupObstacles() {
    this.windGroup = new THREE.Group();
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, 5.4, 48, 1),
      new THREE.MeshStandardMaterial({ color: 0x10191c, roughness: 0.62, metalness: 0.18 }),
    );
    cylinder.position.y = 2.7;
    this.windGroup.add(cylinder);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.01, 0.035, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x7bd7c2 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 5.42;
    this.windGroup.add(rim);
    this.scene.add(this.windGroup);

    this.forceGroup = new THREE.Group();
    const sourceSpecs = [
      { position: [-5.2, 5.4, 0], color: 0x9df2b0 },
      { position: [5.2, 5.4, 0], color: 0xff9d62 },
    ];
    for (const spec of sourceSpecs) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 28, 18),
        new THREE.MeshBasicMaterial({ color: spec.color }),
      );
      sphere.position.set(...spec.position);
      this.forceGroup.add(sphere);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.022, 6, 64),
        new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.55 }),
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(...spec.position);
      this.forceGroup.add(halo);
      const light = new THREE.PointLight(spec.color, 1.4, 12);
      light.position.set(...spec.position);
      this.forceGroup.add(light);
    }
    this.forceGroup.visible = false;
    this.scene.add(this.forceGroup);
  }

  setupProbe() {
    this.probeGroup = new THREE.Group();
    const color = new THREE.Color('#c9f4a1');
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 12),
      new THREE.MeshBasicMaterial({ color }),
    );
    marker.position.y = 0.20;
    this.probeMarker = marker;
    this.probeGroup.add(marker);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.48, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    this.probeRing = ring;
    this.probeGroup.add(ring);

    const stemGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 1.1, 0),
    ]);
    const stem = new THREE.Line(
      stemGeometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
    );
    this.probeStem = stem;
    this.probeGroup.add(stem);

    this.probeArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0.28, 0),
      1.2,
      color,
      0.28,
      0.14,
    );
    this.probeGroup.add(this.probeArrow);
    this.probeGroup.visible = false;
    this.probeGroup.renderOrder = 7;
    this.scene.add(this.probeGroup);
  }

  setupComputeScenes() {
    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.computeCamera = new THREE.Camera();
    this.computeScene = new THREE.Scene();
    this.computeQuad = new THREE.Mesh(quadGeometry, this.materials.compute);
    // The vertex shader emits clip-space positions directly, so Three's camera
    // frustum test must not cull the full-screen compute pass.
    this.computeQuad.frustumCulled = false;
    this.computeScene.add(this.computeQuad);

    this.copyScene = new THREE.Scene();
    this.copyQuad = new THREE.Mesh(quadGeometry, this.copyMaterial);
    this.copyQuad.frustumCulled = false;
    this.copyScene.add(this.copyQuad);
  }

  createInitialParticleTexture(size, amplitude) {
    const rng = mulberry32(Math.floor((this.uniforms.uSeed.value + 1) * 100000));
    const count = size * size;
    const data = new Float32Array(count * 4);
    const gridAttribute = this.arrowGeometry?.getAttribute('aGridPos');
    const gridPositions = gridAttribute?.array;
    const gridCount = Math.min(this.glyphCount || 0, count, gridPositions ? gridPositions.length / 3 : 0);
    for (let i = 0; i < count; i += 1) {
      let x;
      let y;
      let z;
      if (i < gridCount) {
        x = gridPositions[i * 3];
        y = gridPositions[i * 3 + 1];
        z = gridPositions[i * 3 + 2];
      } else {
        x = DOMAIN_MIN[0] + 1.0 + rng() * (DOMAIN_MAX[0] - DOMAIN_MIN[0] - 2.0);
        z = DOMAIN_MIN[2] + 1.0 + rng() * (DOMAIN_MAX[2] - DOMAIN_MIN[2] - 2.0);
        y = Math.max(1.0 + rng() * 11.0, terrainHeight(x, z, amplitude) + 0.55);
      }
      data[i * 4] = x;
      data[i * 4 + 1] = y;
      data[i * 4 + 2] = z;
      data[i * 4 + 3] = rng() * PARTICLE_LIFE * 0.82;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  createRenderTarget(size) {
    const target = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      internalFormat: 'RGBA32F',
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      colorSpace: THREE.NoColorSpace,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
  }

  rebuildParticleResources(quality) {
    const size = quality.particleSize;
    const count = size * size;
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
    }
    if (this.trails) {
      this.scene.remove(this.trails);
      this.trails.geometry.dispose();
    }
    if (this.readRT) this.readRT.dispose();
    if (this.writeRT) this.writeRT.dispose();
    if (this.initialTexture) this.initialTexture.dispose();

    this.initialTexture = this.createInitialParticleTexture(size, this.uniforms.uTerrainAmp.value);
    this.uniforms.uSpawnTexture.value = this.initialTexture;
    this.readRT = null;
    this.writeRT = null;
    this.copyInitialState();

    const uvs = particleUv(size);
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    pointsGeometry.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
    this.points = new THREE.Points(pointsGeometry, this.materials.points);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);

    const trailGeometry = new THREE.BufferGeometry();
    const trailUvs = new Float32Array(count * 2 * 2);
    const ends = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      trailUvs[i * 4] = uvs[i * 2];
      trailUvs[i * 4 + 1] = uvs[i * 2 + 1];
      trailUvs[i * 4 + 2] = uvs[i * 2];
      trailUvs[i * 4 + 3] = uvs[i * 2 + 1];
      ends[i * 2] = 0;
      ends[i * 2 + 1] = 1;
    }
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    trailGeometry.setAttribute('aUv', new THREE.BufferAttribute(trailUvs, 2));
    trailGeometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.trails = new THREE.LineSegments(trailGeometry, this.materials.trails);
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 4;
    this.scene.add(this.trails);

    this.particleCount = count;
    this.rainGeometry.instanceCount = quality.rainCount;
    this.vegetationGeometry.instanceCount = quality.vegetationCount;
    this.uniforms.uReset.value = 0;
    this.needsParticleReset = false;
    this.emitStatus();
  }

  copyInitialState() {
    if (!this.initialTexture) return;
    this.copyMaterial.uniforms.uInitial.value = this.initialTexture;
    this.copyMaterial.uniformsNeedUpdate = true;
    this.uniforms.uSpawnTexture.value = this.initialTexture;
    this.uniforms.uPositionTexture.value = this.initialTexture;
    this.uniforms.uState.value = this.initialTexture;
    for (const material of Object.values(this.materials)) material.uniformsNeedUpdate = true;
  }

  refreshParticleSeeds() {
    if (!this.particleCount) return;
    const size = QUALITY_LEVELS[this.activeQualityId].particleSize;
    if (this.initialTexture) this.initialTexture.dispose();
    this.initialTexture = this.createInitialParticleTexture(size, this.uniforms.uTerrainAmp.value);
    this.copyInitialState();
    this.uniforms.uReset.value = 0;
    this.needsParticleReset = false;
  }

  readParticleStates(count = 16) {
    const width = Math.max(1, Math.min(count, this.particleCount || count));
    const states = [];
    const data = this.initialTexture?.image?.data;
    if (data) {
      for (let i = 0; i < width; i += 1) {
        states.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]]);
      }
    }
    return states;
  }

  createDatasetTexture(dataset) {
    if (!dataset) return this.dummyTexture;
    const [nx, ny, nz] = dataset.dims;
    const texture = new THREE.Data3DTexture(dataset.textureData, nx, ny, nz);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.FloatType;
    texture.internalFormat = 'RGBA32F';
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
  }

  setDataset(dataset, state = null) {
    this.activeDataset = dataset;
    if (this.datasetTexture && this.datasetTexture !== this.dummyTexture) {
      this.datasetTexture.dispose();
    }
    this.datasetTexture = this.createDatasetTexture(dataset);
    this.uniforms.uDataTex.value = this.datasetTexture;
    if (dataset) {
      this.uniforms.uDataDims.value.set(...dataset.dims);
      this.uniforms.uDataBoundsMin.value.set(...dataset.bounds.min);
      this.uniforms.uDataBoundsMax.value.set(...dataset.bounds.max);
      this.uniforms.uDataScalarRange.value.set(...dataset.scalarRange);
    } else {
      this.uniforms.uDataDims.value.set(2, 2, 2);
      this.uniforms.uDataBoundsMin.value.set(-1, -1, -1);
      this.uniforms.uDataBoundsMax.value.set(1, 1, 1);
      this.uniforms.uDataScalarRange.value.set(0, 1);
    }
    if (this.activeModeId === 'custom') this.rebuildGlyphPositions();
    if (state) this.applyState(state);
    this.resetParticles();
    this.emitStatus();
  }

  setMode(modeId, state = null) {
    const mode = FIELD_MODES.find((entry) => entry.id === modeId) || FIELD_MODES[0];
    this.activeModeId = mode.id;
    this.uniforms.uMode.value = MODE_INDEX[mode.id];
    this.uniforms.uTerrainAmp.value = mode.amplitude;
    this.rebuildGlyphPositions();
    this.resetParticles();
    if (state) this.applyState(state);
    this.emitStatus();
  }

  setQuality(qualityId, state = null) {
    if (!QUALITY_LEVELS[qualityId]) return;
    this.activeQualityId = qualityId;
    const quality = QUALITY_LEVELS[qualityId];
    this.rebuildTerrain(quality.terrainSegments);
    this.rebuildGlyphPositions();
    this.rebuildParticleResources(quality);
    if (state) this.applyState(state);
    this.emitStatus();
  }

  resetParticles() {
    this.uniforms.uSeed.value = 0.1 + Math.random() * 999;
    this.refreshParticleSeeds();
  }

  applyLayerVisibility(state) {
    const layers = state.layers || {};
    const terrainMode = this.activeModeId === 'terrain';
    this.terrain.visible = Boolean(layers.terrain);
    this.uniforms.uTerrainOpacity.value = layers.terrain ? 1 : 0;
    const animatedGlyphs = Boolean(layers.glyphs) && Boolean(layers.animatedGlyphs);
    this.arrows.visible = Boolean(layers.glyphs);
    // Shader-time advection is the primary motion path; the position texture is
    // a stable seed grid, so motion cannot disappear when a framebuffer resets.
    this.uniforms.uGlyphAdvection.value = 0;
    this.uniforms.uProceduralGlyphMotion.value = animatedGlyphs ? 1 : 0;
    this.points.visible = Boolean(layers.tracers);
    this.trails.visible = Boolean(layers.tracers);
    this.rain.visible = terrainMode && Boolean(layers.rain);
    this.vegetation.visible = terrainMode && Boolean(layers.vegetation);
    this.domainBox.visible = Boolean(layers.grid);
    this.floorGrid.visible = Boolean(layers.grid);
    this.windGroup.visible = this.activeModeId === 'wind' && Boolean(layers.obstacles);
    this.forceGroup.visible = this.activeModeId === 'force' && Boolean(layers.obstacles);
    this.uniforms.uShowGrid.value = layers.grid ? 1 : 0;
    this.uniforms.uShowContours.value = layers.contours ? 1 : 0;
    this.uniforms.uShowRain.value = terrainMode && layers.rain ? 1 : 0;
    this.uniforms.uShowVegetation.value = terrainMode && layers.vegetation ? 1 : 0;
    this.uniforms.uRainOpacity.value = layers.rain ? 0.48 : 0;
    this.uniforms.uVegetationOpacity.value = layers.vegetation ? 0.58 : 0;
    this.uniforms.uPointOpacity.value = layers.tracers ? 0.95 : 0;
    this.uniforms.uTrailOpacity.value = layers.tracers ? 0.52 : 0;
    this.uniforms.uGlyphOpacity.value = layers.glyphs ? 0.92 : 0;
  }

  applyState(state) {
    this.uniforms.uTime.value = state.time;
    this.uniforms.uMode.value = MODE_INDEX[state.mode] ?? 0;
    this.uniforms.uScalarMode.value = state.scalarMode;
    this.uniforms.uFieldScale.value = state.fieldScale;
    this.uniforms.uDataScale.value = state.dataScale;
    this.uniforms.uGlyphScale.value = state.glyphScale;
    this.uniforms.uTracerRate.value = state.tracerRate;
    this.uniforms.uTrailLength.value = state.trailLength ?? 1;
    this.uniforms.uSliceEnabled.value = state.sliceEnabled ? 1 : 0;
    this.uniforms.uSliceY.value = state.sliceY;
    this.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    this.applyLayerVisibility(state);
    // ShaderMaterial only re-uploads shared uniforms when this flag is set.
    for (const material of Object.values(this.materials)) material.uniformsNeedUpdate = true;
  }

  updateCompute(delta, playing, playbackSpeed) {
    if (!this.computeAvailable || !this.readRT || !this.writeRT) return;
    this.uniforms.uDelta.value = playing ? delta * playbackSpeed : 0;
    this.uniforms.uState.value = this.readRT.texture;
    this.materials.compute.uniformsNeedUpdate = true;
    this.renderer.setRenderTarget(this.writeRT);
    this.renderer.render(this.computeScene, this.computeCamera);
    this.renderer.setRenderTarget(null);
    const previous = this.readRT;
    this.readRT = this.writeRT;
    this.writeRT = previous;
    this.uniforms.uPositionTexture.value = this.readRT.texture;
    this.uniforms.uState.value = this.readRT.texture;
    this.uniforms.uReset.value = 0;
    this.needsParticleReset = false;
    for (const material of Object.values(this.materials)) material.uniformsNeedUpdate = true;
  }

  animateCamera() {
    if (!this.cameraGoal) return;
    this.camera.position.lerp(this.cameraGoal.position, 0.11);
    this.controls.target.lerp(this.cameraGoal.target, 0.11);
    if (this.camera.position.distanceTo(this.cameraGoal.position) < 0.04
      && this.controls.target.distanceTo(this.cameraGoal.target) < 0.04) {
      this.camera.position.copy(this.cameraGoal.position);
      this.controls.target.copy(this.cameraGoal.target);
      this.cameraGoal = null;
    }
  }

  update(delta, state, rawDelta = delta) {
    this.applyState(state);
    // Time-driven vertex-shader advection keeps arrows and tracers moving even
    // when float render targets are unavailable or a context is restored.
    this.uniforms.uDelta.value = 0;
    this.animateCamera();
    this.controls.update();
    if (this.probeGroup.visible) {
      const pulse = 1 + Math.sin(state.time * 2.6) * 0.07;
      this.probeRing.scale.setScalar(pulse);
    }
    this.renderer.render(this.scene, this.camera);

    this.frameAccumulator += rawDelta;
    this.frameCount += 1;
    if (this.frameAccumulator >= 0.5) {
      this.lastFps = this.frameCount / this.frameAccumulator;
      this.frameAccumulator = 0;
      this.frameCount = 0;
      this.onFrame({
        fps: this.lastFps,
        frameMs: 1000 / Math.max(1, this.lastFps),
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
      });
    }
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const width = Math.max(1, parent.clientWidth || this.canvas.clientWidth || 800);
    const height = Math.max(1, parent.clientHeight || this.canvas.clientHeight || 600);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
  }

  setView(name) {
    const views = {
      iso: { position: [24, 18, 28], target: [0, 3, 0] },
      top: { position: [0.01, 38, 0.01], target: [0, 0, 0] },
      side: { position: [34, 10, 0.01], target: [0, 3, 0] },
    };
    const view = views[name] || views.iso;
    this.cameraGoal = {
      position: new THREE.Vector3(...view.position),
      target: new THREE.Vector3(...view.target),
    };
  }

  probeFromPointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const ray = this.raycaster.ray;
    const amplitude = this.uniforms.uTerrainAmp.value;
    const point = new THREE.Vector3();
    let previousT = 0;
    let previousSigned = Number.POSITIVE_INFINITY;
    for (let t = 0; t <= 130; t += 0.42) {
      ray.at(t, point);
      const signed = point.y - terrainHeight(point.x, point.z, amplitude);
      if (t > 0 && previousSigned > 0 && signed <= 0) {
        let lo = previousT;
        let hi = t;
        for (let i = 0; i < 14; i += 1) {
          const mid = (lo + hi) * 0.5;
          ray.at(mid, point);
          const midSigned = point.y - terrainHeight(point.x, point.z, amplitude);
          if (midSigned > 0) lo = mid;
          else hi = mid;
        }
        ray.at((lo + hi) * 0.5, point);
        if (Math.abs(point.x) <= 16.2 && Math.abs(point.z) <= 16.2) {
          return [point.x, point.y + 0.12, point.z];
        }
        break;
      }
      previousT = t;
      previousSigned = signed;
    }
    const planeHit = new THREE.Vector3();
    if (ray.intersectPlane(this.probePlane, planeHit)
      && Math.abs(planeHit.x) <= 16 && Math.abs(planeHit.z) <= 16) {
      return [planeHit.x, terrainHeight(planeHit.x, planeHit.z, amplitude) + 0.12, planeHit.z];
    }
    return null;
  }

  setProbe(point, vector, rgb) {
    this.probeGroup.position.set(...point);
    this.probeGroup.visible = true;
    const color = new THREE.Color(`rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
    this.probeMarker.material.color.copy(color);
    this.probeRing.material.color.copy(color);
    this.probeStem.material.color.copy(color);
    const direction = new THREE.Vector3(...vector);
    const speed = direction.length();
    if (speed > 1e-5) direction.normalize();
    else direction.set(1, 0, 0);
    this.probeArrow.setDirection(direction);
    this.probeArrow.setLength(Math.max(0.45, Math.min(3.2, speed * 0.38)), 0.28, 0.14);
    this.probeArrow.setColor(color);
  }

  clearProbe() {
    this.probeGroup.visible = false;
  }

  emitStatus() {
    const quality = QUALITY_LEVELS[this.activeQualityId];
    this.onStatus({
      webgl2: true,
      computeAvailable: this.computeAvailable,
      quality: quality.label,
      glyphCount: this.glyphCount || 0,
      particleCount: this.particleCount || 0,
      terrainVertices: (quality.terrainSegments + 1) ** 2,
      dataset: this.activeDataset,
    });
  }
}
