/**
 * Landscape Studio viewport.
 *
 * Renders a planet-scale authored landscape without streaming geometry from
 * disk. Three cooperating systems:
 *
 *   1. LOD scenery  — concentric rings of clipmap tiles around the camera focus.
 *      Each tile is a regular grid sampled from the analytic SDF field, so tile
 *      cost falls off with distance by construction (fewer octaves per sample)
 *      instead of by decimation.
 *   2. Ocean        — a GPU virtual-pipe shallow-water solve over an adaptive
 *      bed sampled from the same field, rendered with swell, per-pixel normals,
 *      absorption and simulated whitewater; plus an analytic open-ocean shell
 *      that carries the horizon so the 40,000 km scale never shows an edge.
 *   3. Sculpting    — brush strokes are stored as data in the document and the
 *      affected tiles are re-derived. Nothing is baked, so there is no undo
 *      history of heightmaps (only of the kilobyte document).
 *
 * All world coordinates are metres. A 3,200 km world with a 0.1 m near plane is
 * why the renderer runs with a logarithmic depth buffer.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  buildRegionMesh,
  createLandscapeField,
  estimateLandFraction,
} from '../core/landscape-field.js';
import {
  LANDMASS_STAMP_KINDS,
  SCULPT_TOOLS,
  addStamp,
  createStroke,
  documentStats,
  findLayer,
  pushStrokePoint,
  recomputeStrokeBounds,
  tilesForBounds,
  touchDocument,
} from '../core/landscape-document.js';
import { LandscapeTileScheduler } from '../core/landscape-tiles.js';
import { clamp, smoothstep } from '../core/landscape-math.js';
import { LandscapeOceanSimulation } from './landscape-ocean.js';
import { SKY_FRAGMENT, SKY_VERTEX, TERRAIN_FRAGMENT, TERRAIN_VERTEX } from './landscape-shaders.js';

/**
 * Clipmap rings. `tileMeters * radiusTiles` is how far that ring reaches; the
 * union covers roughly 2,000 km, which is a continent plus its shelf. Each ring
 * keeps a fixed quad count, so per-ring cost is constant regardless of scale —
 * the whole reason this works on an HDD with no paging.
 */
const RINGS = Object.freeze([
  { tileMeters: 256, radius: 5, cellMeters: 8 },
  { tileMeters: 1_024, radius: 4, cellMeters: 32 },
  { tileMeters: 4_096, radius: 4, cellMeters: 128 },
  { tileMeters: 16_384, radius: 4, cellMeters: 512 },
  { tileMeters: 65_536, radius: 4, cellMeters: 2_048 },
  { tileMeters: 262_144, radius: 3, cellMeters: 8_192 },
  { tileMeters: 1_048_576, radius: 2, cellMeters: 32_768 },
]);

const TILE_QUADS = 32;
const NEAR_OCEAN_SPAN = 14_000;
const NEAR_OCEAN_RESOLUTION = 320;
const OCEAN_RECENTER_FRACTION = 0.34;

const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _hit = new THREE.Vector3();

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export class LandscapeViewport {
  constructor(container, document_, options = {}) {
    this.container = container;
    this.doc = document_;
    this._rendererFactory = options.createRenderer || null;
    this.field = createLandscapeField(this.doc);
    this.active = false;
    this.time = 0;
    this.focus = new THREE.Vector2(0, 0);
    this.viewDistance = 260_000;
    this.lastOceanFocus = new THREE.Vector2(Number.NaN, Number.NaN);
    this.oceanSpan = NEAR_OCEAN_SPAN;

    this.tool = 'navigate';
    this.brush = {
      radius: 900,
      strength: 0.5,
      falloff: 0.65,
      targetHeight: null,
    };
    this.stampKind = 'island';
    this.stampScale = 1;

    this.stroke = null;
    this.strokeLayerId = null;
    this.pointerDown = false;
    this.pointerMoved = false;
    this.lastPick = null;
    this.pickPending = false;
    this.lastStrokeCommitAt = 0;

    this.sun = { azimuthDeg: 128, elevationDeg: 34 };
    this.showGrid = false;
    this.wireframe = false;

    this._terrainGroup = new THREE.Group();
    this._tileGeometry = new Map();
    this._dirtyTiles = new Set();

    this.stats = {
      fps: 0,
      frameMs: 0,
      tiles: 0,
      triangles: 0,
      queued: 0,
      residentMb: 0,
      budgetMb: 0,
      landFraction: 0,
      lastBuildMs: 0,
      oceanSimMs: 0,
      focusX: 0,
      focusZ: 0,
      altitude: 0,
    };
    this._frameTimes = [];
    this._onStats = options.onStats || null;
    this._onPick = options.onPick || null;
    this._onDocChanged = options.onDocChanged || null;

    this._initRenderer();
    this._initScene();
    this._initTerrain();
    this._initOcean();
    this._initBrush();
    this._bindEvents();

    this.scheduler = new LandscapeTileScheduler({
      budgetBytes: 320 * 1024 * 1024,
      tilesPerFrame: 3,
      maxTiles: 640,
      onEvict: (tile) => this._disposeTile(tile),
    });

    this.frameCamera('overview');
    this._refreshLandFraction(true);
    this._animate = this._animate.bind(this);
    this._animate();
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  _initRenderer() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(52, width / Math.max(1, height), 0.1, 40_000_000);
    this.camera.position.set(0, 42_000, 68_000);

    // Renderer construction is injectable so the workspace can be exercised
    // headlessly in tests; the real path always builds a WebGLRenderer.
    this.renderer = this._rendererFactory
      ? this._rendererFactory()
      : new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: true,
      });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = true;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 6_000_000;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 1.1;
    this.controls.target.set(0, 0, 0);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = null;
    this.sky = {
      zenith: new THREE.Color('#5d84b4'),
      horizon: new THREE.Color('#c3d3e0'),
      fog: new THREE.Color('#aebdc9'),
    };
    this.backgroundMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.2).normalize() },
        uSkyZenith: { value: this.sky.zenith },
        uSkyHorizon: { value: this.sky.horizon },
        uFogColor: { value: this.sky.fog },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), this.backgroundMaterial);
    dome.frustumCulled = false;
    dome.renderOrder = -1000;
    this.skyDome = dome;
    this.scene.add(dome);

    this.scene.add(this._terrainGroup);

    this._sunDir = new THREE.Vector3();
    this._updateSunDirection();
  }

  _updateSunDirection() {
    const az = (this.sun.azimuthDeg * Math.PI) / 180;
    const el = (this.sun.elevationDeg * Math.PI) / 180;
    this._sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    this.backgroundMaterial.uniforms.uSunDir.value.copy(this._sunDir);
    if (this.terrainMaterials) {
      for (const material of this.terrainMaterials) {
        material.uniforms.uSunDir.value.copy(this._sunDir);
      }
    }
    this.ocean?.setSunDirection?.(this._sunDir);
    if (this.oceanSimSurface) {
      this.oceanSimSurface.material.uniforms.uSunDir.value.copy(this._sunDir);
    }
    if (this.farOcean) {
      this.farOcean.material.uniforms.uSunDir.value.copy(this._sunDir);
    }
  }

  _initTerrain() {
    this.terrainMaterials = [];
    this._sharedTerrainUniforms = {
      uSeaLevel: { value: this._seaLevel() },
      uFogDensity: { value: 0.0000055 },
      uFogColor: { value: this.sky.fog },
      uSunDir: { value: this._sunDir.clone() },
      uSkyZenith: { value: this.sky.zenith },
      uSkyHorizon: { value: this.sky.horizon },
      uSnowLine: { value: 2_700 },
      uAmbient: { value: 0.34 },
    };
    this.terrainMaterial = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERTEX,
      fragmentShader: TERRAIN_FRAGMENT,
      uniforms: this._sharedTerrainUniforms,
      side: THREE.DoubleSide,
    });
    this.terrainMaterials.push(this.terrainMaterial);
    this.terrainMaterial.wireframe = this.wireframe;
    this._refreshSnowLine();
  }

  /** Push every authored ocean control into the simulation and the material. */
  _applyOceanSettings() {
    if (!this.oceanSim) return;
    const ocean = this.doc.ocean;
    this.oceanSim.setSettings({
      waveHeight: ocean.waveHeight,
      waveLength: ocean.waveLength,
      waveDirectionDeg: ocean.swellDirectionDeg,
      speed: ocean.speed,
      surfStrength: 0.55 + ocean.foam * 1.1,
      showFoam: ocean.foam > 0.02,
      foam: ocean.foam,
      clarity: ocean.clarity,
      choppiness: ocean.choppiness,
      windSpeed: ocean.windSpeed,
      // Wave steepness beyond 1.0 makes Gerstner loops self-intersect, so the
      // authored choppiness is clamped to what the surface can actually carry.
      detailAmplitude: 0.25 + ocean.choppiness * 0.9,
      shallowColor: new THREE.Color('#2f8f83').lerp(new THREE.Color('#46b1a2'), 0.35 * ocean.clarity),
      deepColor: new THREE.Color('#0a2b3f'),
    });
    this.oceanSim.setSunDirection(this._sunDir);
    this.oceanSim.setSky(this.sky.zenith, this.sky.horizon, this.sky.fog);
  }

  /**
   * Snow line in metres above sea level. Authored explicitly in the base layer,
   * otherwise derived from the planet's own mountain height so the palette
   * scales with whatever was sculpted.
   */
  _refreshSnowLine() {
    const base = this.doc.layers.find((layer) => layer.kind === 'base');
    const authored = Number(base?.params?.snowLineMeters) || 0;
    const peak = Math.max(160, (Number(base?.params?.continentHeightMeters) || 1_500) * 2.2);
    this.snowLineMeters = authored > 0 ? authored : peak;
    if (this._sharedTerrainUniforms?.uSnowLine) {
      this._sharedTerrainUniforms.uSnowLine.value = this.snowLineMeters;
    }
  }

  _seaLevel() {
    const base = this.doc.layers.find((layer) => layer.kind === 'base');
    return (Number(this.doc.ocean?.seaLevel) || 0) + (Number(base?.params?.seaLevel) || 0);
  }

  _initOcean() {
    this.oceanSim = new LandscapeOceanSimulation(this.renderer, this.scene, {
      resolution: NEAR_OCEAN_RESOLUTION,
      spanMeters: this.oceanSpan,
      seaLevel: this._seaLevel(),
      waveHeight: this.doc.ocean.waveHeight,
      waveLength: this.doc.ocean.waveLength,
      waveDirectionDeg: this.doc.ocean.swellDirectionDeg,
      surfStrength: 1,
      speed: this.doc.ocean.speed,
      opacity: 0.92,
      showFoam: this.doc.ocean.foam > 0,
    });
    this.oceanSimSurface = this.oceanSim.surfaceMesh;
    this.oceanSimSurface.visible = this.doc.ocean.enabled;

    // Open-ocean shell: analytic swell that carries the horizon out to 900 km so
    // the world never visibly ends. It is a separate, cheap material because the
    // simulated domain only ever needs to cover the shore you can look at.
    const farGeometry = new THREE.RingGeometry(NEAR_OCEAN_SPAN * 0.34, 900_000, 128, 24);
    farGeometry.rotateX(-Math.PI / 2);
    this.farOceanMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        precision highp float;
        uniform float uTime;
        uniform vec3 uFocus;
        uniform vec4 uSwell;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vCrest;
        void main() {
          vec3 world = position;
          world.x += uFocus.x;
          world.z += uFocus.z;
          vec2 p = world.xz * 0.06;
          vec2 dir = normalize(uSwell.xy + vec2(1e-5));
          float k = 6.2831853 / max(20.0, uSwell.w * 4.0);
          float a = uSwell.z * 1.6;
          float phase = dot(dir, p) * k * 6.0 - uTime * sqrt(9.81 * k * 6.0);
          world.y = uSwell.w * 0.0 + sin(phase) * a;
          float phase2 = dot(normalize(dir.yx + vec2(1e-5)), p) * k * 11.0 - uTime * 2.4;
          world.y += sin(phase2) * a * 0.42;
          vCrest = sin(phase) * 0.5 + 0.5;
          vec3 nx = vec3(-cos(phase) * a * k * 6.0, 0.0, 0.0);
          vNormalW = normalize(vec3(cos(phase) * 0.16, 1.0, sin(phase2) * 0.1));
          vWorld = world;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vCrest;
        uniform vec3 uSunDir;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform float uFogDensity;
        uniform vec3 uFogColor;

        vec3 skyRadiance(vec3 dir) {
          float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          return mix(uSkyHorizon, uSkyZenith, pow(up, 0.62));
        }

        void main() {
          vec3 N = normalize(vNormalW);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 L = normalize(uSunDir);
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
          vec3 col = mix(uDeepColor, skyRadiance(R), clamp(fres + 0.14, 0.0, 0.92));
          vec3 H = normalize(L + V);
          float spec = pow(max(0.0, dot(N, H)), 260.0) * 7.0;
          col += vec3(1.0, 0.95, 0.88) * spec;
          float dist = length(cameraPosition - vWorld);
          float fog = 1.0 - exp(-pow(dist * uFogDensity * 0.72, 1.15));
          col = mix(col, mix(uSkyHorizon, uFogColor, 0.4), clamp(fog, 0.0, 0.97));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uFocus: { value: new THREE.Vector3() },
        uSwell: { value: new THREE.Vector4(0.7, 0.7, this.doc.ocean.waveHeight, this.doc.ocean.waveLength) },
        uSunDir: { value: this._sunDir.clone() },
        uSkyZenith: { value: this.sky.zenith },
        uSkyHorizon: { value: this.sky.horizon },
        uDeepColor: { value: new THREE.Color('#0b2331') },
        uShallowColor: { value: new THREE.Color('#2f7f7a') },
        uFogDensity: { value: 0.0000055 },
        uFogColor: { value: this.sky.fog },
      },
      side: THREE.DoubleSide,
    });
    this.farOcean = new THREE.Mesh(farGeometry, this.farOceanMaterial);
    this.farOcean.frustumCulled = false;
    this.farOcean.renderOrder = 1;
    this.scene.add(this.farOcean);
  }

  _initBrush() {
    const geometry = new THREE.RingGeometry(0.9, 1, 64);
    geometry.rotateX(-Math.PI / 2);
    this.brushCursor = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: '#ffd166',
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    this.brushCursor.renderOrder = 10;
    this.brushCursor.visible = false;
    this.scene.add(this.brushCursor);

    // A second ring shows the actual falloff reach (2.3x the radius), which is
    // what the field evaluator actually uses.
    const outer = new THREE.RingGeometry(0.985, 1, 64);
    outer.rotateX(-Math.PI / 2);
    this.brushReach = new THREE.Mesh(
      outer,
      new THREE.MeshBasicMaterial({
        color: '#ffd166',
        transparent: true,
        opacity: 0.22,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    this.brushReach.renderOrder = 10;
    this.brushReach.visible = false;
    this.scene.add(this.brushReach);

    this.stampGhost = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1, 96),
      new THREE.MeshBasicMaterial({
        color: '#5ac8fa',
        transparent: true,
        opacity: 0.75,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    this.stampGhost.rotation.x = -Math.PI / 2;
    this.stampGhost.visible = false;
    this.stampGhost.renderOrder = 10;
    this.scene.add(this.stampGhost);
  }

  _bindEvents() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    const canvas = this.renderer.domElement;
    this._onPointerDown = (event) => this._handlePointerDown(event);
    this._onPointerMove = (event) => this._handlePointerMove(event);
    this._onPointerUp = (event) => this._handlePointerUp(event);
    this._onWheel = () => this._queuePick();
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: true });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  // -------------------------------------------------------------------------
  // Public API used by the studio controller
  // -------------------------------------------------------------------------

  setActive(flag) {
    this.active = Boolean(flag);
    this.controls.enabled = this.active;
    if (this.active) {
      this.resize();
    } else {
      this.pointerDown = false;
      this.brushCursor.visible = false;
      this.brushReach.visible = false;
      this.stampGhost.visible = false;
    }
  }

  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setDocument(doc) {
    this.doc = doc;
    this.field = createLandscapeField(doc);
    this._sharedTerrainUniforms.uSeaLevel.value = this._seaLevel();
    this._refreshSnowLine();
    this.scheduler.invalidate(null);
    this.scheduler.clear();
    this._recentreOcean(true);
    this._refreshLandFraction(true);
    this.docDirty = true;
  }

  /** Called after any document mutation so dependent systems can react. */
  notifyDocumentChanged(bounds = null) {
    this.field = createLandscapeField(this.doc);
    this._sharedTerrainUniforms.uSeaLevel.value = this._seaLevel();
    this._refreshSnowLine();
    if (bounds) this.invalidateBounds(bounds);
    else this.scheduler.invalidate(null);
    this._queueOceanRefresh();
    this._refreshLandFraction();
    if (this._onDocChanged) this._onDocChanged(this.doc);
  }

  invalidateBounds(bounds) {
    if (!bounds) return;
    const tileMeters = this._activeTileMeters();
    for (const tile of tilesForBounds(bounds, tileMeters, 512)) {
      if (tile.coarse) {
        this.scheduler.invalidate(null);
        return;
      }
      const key = this._tileKeyFor(tile.tx, tile.tz, tileMeters);
      this.scheduler.invalidate((descriptor) => descriptor.key === key);
    }
    // Resident tiles inside the brush are rebuilt immediately so sculpting
    // feels direct, not queued.
    this._rebuildResidentInBounds(bounds);
  }

  setTool(tool) {
    this.tool = tool;
    const sculpting = tool !== 'navigate' && !tool.startsWith('stamp:');
    this.controls.mouseButtons = sculpting
      ? { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    if (tool.startsWith('stamp:')) this.stampKind = tool.slice('stamp:'.length);
    if (tool === 'navigate') {
      this.brushCursor.visible = false;
      this.brushReach.visible = false;
      this.stampGhost.visible = false;
    }
  }

  setBrush(brush = {}) {
    Object.assign(this.brush, brush);
    if (this.brushCursor.visible) this._updateBrushVisual(this.lastPick);
  }

  setStampScale(scale) {
    this.stampScale = clamp(Number(scale) || 1, 0.05, 12);
  }

  setSun(azimuthDeg, elevationDeg) {
    this.sun.azimuthDeg = Number(azimuthDeg) || 0;
    this.sun.elevationDeg = clamp(Number(elevationDeg) || 0, 2, 88);
    this._updateSunDirection();
  }

  setWireframe(enabled) {
    this.wireframe = Boolean(enabled);
    this.terrainMaterial.wireframe = this.wireframe;
  }

  setOceanVisible(visible) {
    this.doc.ocean.enabled = Boolean(visible);
    if (this.oceanSimSurface) this.oceanSimSurface.visible = this.doc.ocean.enabled;
    if (this.farOcean) this.farOcean.visible = this.doc.ocean.enabled;
    this.oceanSim.enabled = this.doc.ocean.enabled;
  }

  frameCamera(mode = 'overview') {
    const span = this.doc.world.spanMeters;
    if (mode === 'overview') {
      const dist = Math.min(span * 1.15, 3_400_000);
      this.camera.position.set(dist * 0.28, dist * 0.52, dist * 0.82);
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'top') {
      this.camera.position.set(0, Math.min(span * 1.1, 4_200_000), 1);
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'coast') {
      const point = this._findCoastPoint();
      const eye = Math.max(2_400, span * 0.006);
      this.controls.target.set(point.x, 0, point.z);
      this.camera.position.set(point.x + eye * 0.8, eye * 0.55, point.z + eye * 0.9);
    } else if (mode === 'ground') {
      const pick = this.lastPick || { x: 0, z: 0, y: 0 };
      this.controls.target.set(pick.x, pick.y + 60, pick.z);
      this.camera.position.set(pick.x + 900, pick.y + 420, pick.z + 900);
    }
    this.controls.update();
    this._focusFromCamera();
    this._recentreOcean(true);
  }

  dispose() {
    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = 0;
    }
    this.active = false;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointerup', this._onPointerUp);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('wheel', this._onWheel);
    this.scheduler.clear();
    this.oceanSim.dispose();
    this.farOcean.geometry.dispose();
    this.farOceanMaterial.dispose();
    this.terrainMaterial.dispose();
    this.backgroundMaterial.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // -------------------------------------------------------------------------
  // Tiles
  // -------------------------------------------------------------------------

  _activeTileMeters() {
    return RINGS[1].tileMeters;
  }

  _tileKeyFor(tx, tz, tileMeters) {
    return `${tileMeters}:${tx}:${tz}`;
  }

  _disposeTile(tile) {
    const mesh = this._tileGeometry.get(tile.key);
    if (mesh) {
      this._terrainGroup.remove(mesh);
      mesh.geometry.dispose();
      this._tileGeometry.delete(tile.key);
    }
  }

  _ringDescriptors() {
    const focusX = this.focus.x;
    const focusZ = this.focus.y;
    const descriptors = [];
    const viewRadius = this.viewDistance;

    for (let r = 0; r < RINGS.length; r++) {
      const ring = RINGS[r];
      const centerTx = Math.floor(focusX / ring.tileMeters);
      const centerTz = Math.floor(focusZ / ring.tileMeters);
      for (let dz = -ring.radius; dz <= ring.radius; dz++) {
        for (let dx = -ring.radius; dx <= ring.radius; dx++) {
          const tx = centerTx + dx;
          const tz = centerTz + dz;
          const tileX = tx * ring.tileMeters;
          const tileZ = tz * ring.tileMeters;
          if (r > 0) {
            const previous = RINGS[r - 1];
            const insidePrevious = Math.abs(tileX + ring.tileMeters * 0.5 - focusX) < previous.radius * previous.tileMeters - ring.tileMeters * 0.5
              && Math.abs(tileZ + ring.tileMeters * 0.5 - focusZ) < previous.radius * previous.tileMeters - ring.tileMeters * 0.5;
            if (insidePrevious) continue;
          }
          const distance = Math.hypot(
            tileX + ring.tileMeters * 0.5 - focusX,
            tileZ + ring.tileMeters * 0.5 - focusZ
          );
          if (distance > viewRadius + ring.tileMeters) continue;
          descriptors.push({
            key: this._tileKeyFor(tx, tz, ring.tileMeters),
            tx,
            tz,
            tileMeters: ring.tileMeters,
            cellMeters: ring.cellMeters,
            ring: r,
            distance,
            revision: this.doc.revision,
          });
        }
      }
    }
    descriptors.sort((a, b) => a.distance - b.distance);
    return descriptors;
  }

  _buildTile(descriptor) {
    if (descriptor.revision !== this.doc.revision && !this._dirtyTilesDaemon) {
      // A tile queued before an edit: politely decline so the refresh re-queues
      // it against the current document. Cheaper than building stale geometry.
      return null;
    }
    const started = nowMs();
    const mesh = buildRegionMesh(this.field, {
      tx: descriptor.tx,
      tz: descriptor.tz,
      chunkMeters: descriptor.tileMeters,
      cellMeters: descriptor.cellMeters,
      lod: descriptor.ring,
    });

    const seaLevel = this._seaLevel();
    const count = mesh.heights.length;
    const elevation = new Float32Array(count);
    const curvature = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      elevation[i] = mesh.heights[i];
      // Cheap cavity proxy: difference between the vertex and its ring mean.
      const ix = i % mesh.nx;
      const iz = (i / mesh.nx) | 0;
      const hL = mesh.heights[iz * mesh.nx + Math.max(0, ix - 1)];
      const hR = mesh.heights[iz * mesh.nx + Math.min(mesh.nx - 1, ix + 1)];
      const hD = mesh.heights[Math.max(0, iz - 1) * mesh.nx + ix];
      const hU = mesh.heights[Math.min(mesh.nx - 1, iz + 1) * mesh.nx + ix];
      const mean = (hL + hR + hD + hU) * 0.25;
      const relief = Math.max(1, descriptor.cellMeters * 6);
      curvature[i] = clamp((mesh.heights[i] - mean) / relief, -1, 1);
    }
    void seaLevel;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    geometry.setAttribute('aElevation', new THREE.BufferAttribute(elevation, 1));
    geometry.setAttribute('aCurvature', new THREE.BufferAttribute(curvature, 1));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const object = new THREE.Mesh(geometry, this.terrainMaterial);
    object.matrixAutoUpdate = false;
    object.updateMatrix();
    this._terrainGroup.add(object);
    this._tileGeometry.set(descriptor.key, object);

    const bytes = geometry.attributes.position.array.byteLength
      + geometry.attributes.normal.array.byteLength
      + geometry.attributes.aElevation.array.byteLength
      + geometry.attributes.aCurvature.array.byteLength
      + geometry.index.array.byteLength;

    return {
      data: object,
      bytes,
      buildMs: nowMs() - started,
      triangles: mesh.indices.length / 3,
    };
  }

  _rebuildResidentInBounds(bounds) {
    if (!bounds) return;
    let rebuilt = 0;
    for (const [key, tile] of [...this.scheduler.tiles]) {
      const descriptor = tile.descriptor;
      const minX = descriptor.tx * descriptor.tileMeters;
      const minZ = descriptor.tz * descriptor.tileMeters;
      const maxX = minX + descriptor.tileMeters;
      const maxZ = minZ + descriptor.tileMeters;
      if (maxX < bounds.minX || minX > bounds.maxX || maxZ < bounds.minZ || minZ > bounds.maxZ) continue;
      if (descriptor.ring > 2) continue;
      const result = this._buildTile({ ...descriptor, revision: this.doc.revision });
      if (!result) continue;
      const previous = this._tileGeometry.get(key);
      if (previous) {
        this._terrainGroup.remove(previous);
        previous.geometry.dispose();
      }
      this._tileGeometry.set(key, result.data);
      tile.data = result.data;
      tile.bytes = result.bytes;
      rebuilt += 1;
      if (rebuilt >= 24) break;
    }
  }

  _refreshTiles() {
    const descriptors = this._ringDescriptors();
    const keep = new Set(descriptors.map((descriptor) => descriptor.key));
    this.scheduler.prune(keep);
    let tris = 0;
    for (const descriptor of descriptors) {
      const resident = this.scheduler.get(descriptor.key);
      if (resident && resident.descriptor.revision === this.doc.revision && resident.descriptor.cellMeters === descriptor.cellMeters) {
        tris += resident.data.geometry.index.count / 3;
        continue;
      }
      this.scheduler.request(descriptor.key, descriptor, descriptor.distance);
    }
    this.scheduler.pump((descriptor) => this._buildTile(descriptor));
    for (const tile of this.scheduler.tiles.values()) {
      tris += tile.data.geometry.index.count / 3;
    }
    this.stats.triangles = tris;
  }

  // -------------------------------------------------------------------------
  // Ocean
  // -------------------------------------------------------------------------

  _queueOceanRefresh(delay = 220) {
    if (this._oceanRefreshTimer) return;
    this._oceanRefreshTimer = setTimeout(() => {
      this._oceanRefreshTimer = null;
      this._recentreOcean(true);
    }, delay);
  }

  _recentreOcean(force = false) {
    if (!this.oceanSim) return;
    const focus = this.focus;
    const span = this.oceanSpan;
    if (!force) {
      const moved = Math.hypot(focus.x - this.lastOceanFocus.x, focus.y - this.lastOceanFocus.y);
      if (moved < span * OCEAN_RECENTER_FRACTION) return;
    }
    this.lastOceanFocus.set(focus.x, focus.y);
    this.oceanSim.setOffset(focus.x, focus.y);

    const started = nowMs();
    const resolution = NEAR_OCEAN_RESOLUTION;
    const cell = span / resolution;
    const seaLevel = this._seaLevel();
    const heights = new Float32Array(resolution * resolution);
    const connectivity = new Float32Array(resolution * resolution);
    const originX = focus.x - span * 0.5;
    const originZ = focus.y - span * 0.5;


    for (let iz = 0; iz < resolution; iz++) {
      const z = originZ + iz * cell;
      for (let ix = 0; ix < resolution; ix++) {
        heights[iz * resolution + ix] = this.field.elevationAt(originX + ix * cell, z, cell * 1.4);
      }
    }
    // Connectivity: flood fill from the border of this window. Enclosed basins
    // stay dry until water overtops the sill dynamically.
    const stack = new Int32Array(resolution * resolution);
    let top = 0;
    const push = (ix, iz) => {
      if (ix < 0 || iz < 0 || ix >= resolution || iz >= resolution) return;
      const idx = iz * resolution + ix;
      if (connectivity[idx]) return;
      if (heights[idx] >= seaLevel) return;
      connectivity[idx] = 1;
      stack[top++] = idx;
    };
    for (let i = 0; i < resolution; i++) {
      push(i, 0);
      push(i, resolution - 1);
      push(0, i);
      push(resolution - 1, i);
    }
    while (top > 0) {
      const idx = stack[--top];
      const ix = idx % resolution;
      const iz = (idx / resolution) | 0;
      push(ix - 1, iz);
      push(ix + 1, iz);
      push(ix, iz - 1);
      push(ix, iz + 1);
    }

    this.oceanSpanCurrent = span;
    this.oceanSim.spanMeters = span;
    this.oceanSim.seaLevel = seaLevel;
    this.oceanSim.syncBed(heights, connectivity, seaLevel);
    this._applyOceanSettings();
    this.stats.oceanSimMs = nowMs() - started;
  }

  // -------------------------------------------------------------------------
  // Picking + sculpting
  // -------------------------------------------------------------------------

  _queuePick() {
    if (this.pickPending) return;
    this.pickPending = true;
    requestAnimationFrame(() => {
      this.pickPending = false;
      if (this.lastPointer) this._pick(this.lastPointer.x, this.lastPointer.y);
    });
  }

  _ndcFromEvent(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      y: -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    };
  }

  /**
   * Analytic ray march against the SDF. Independent of what tiles happen to be
   * resident, so a brush still lands correctly while distant geometry is still
   * being generated.
   */
  _pick(ndcX, ndcY) {
    // Unprojecting reads the camera's world matrix, which is normally refreshed
    // by the renderer — but the very first click can arrive before the first
    // frame, so make sure the matrices are current.
    this.camera.updateMatrixWorld();
    this.camera.getWorldPosition(_rayOrigin);
    _rayDir.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(_rayOrigin).normalize();

    // Step scale from the camera's distance to the focus so both a ground-level
    // brush and a 200 km view resolve in the same number of steps.
    const distanceToFocus = Math.hypot(
      this.camera.position.x - this.controls.target.x,
      this.camera.position.z - this.controls.target.z,
      this.camera.position.y - this.controls.target.y
    );
    const step = clamp(distanceToFocus * 0.006, 0.4, 4_000);
    const maxSteps = 320;
    // Evaluate the field at a scale that matches the march step: sampling far
    // coarser than the step invents hills the ray then misses, which makes
    // brushes land hundreds of metres from the cursor.
    const cell = clamp(Math.min(this.brush.radius * 0.12, step * 2), 0.5, 2_000);

    let previousT = 0;
    let previousValue = 0;
    let found = null;
    const origin = _rayOrigin;
    const dir = _rayDir;
    // Skip the first few steps over the camera position to avoid self-hits.
    for (let i = 1; i <= maxSteps; i++) {
      const t = i * step;
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      const value = y - this.field.elevationAt(x, z, cell);
      if (i > 1 && previousValue > 0 && value <= 0) {
        // Bisect the crossing.
        let lo = previousT;
        let hi = t;
        for (let b = 0; b < 12; b++) {
          const mid = (lo + hi) * 0.5;
          const mx = origin.x + dir.x * mid;
          const my = origin.y + dir.y * mid;
          const mz = origin.z + dir.z * mid;
          const mv = my - this.field.elevationAt(mx, mz, cell);
          if (mv > 0) lo = mid;
          else hi = mid;
        }
        const hitT = (lo + hi) * 0.5;
        found = {
          x: origin.x + dir.x * hitT,
          y: origin.y + dir.y * hitT,
          z: origin.z + dir.z * hitT,
          distance: hitT,
        };
        break;
      }
      previousT = t;
      previousValue = value;
      // Terminate early once the ray is well below the surface.
      if (value < -step * 4 && i > 6) break;
    }

    if (!found) {
      this.lastPick = null;
      if (this.tool !== 'navigate') {
        this.brushCursor.visible = false;
        this.brushReach.visible = false;
        this.stampGhost.visible = false;
      }
      if (this._onPick) this._onPick(null);
      return null;
    }

    this.lastPick = found;
    this._updateBrushVisual(found);
    if (this._onPick) this._onPick(found);
    return found;
  }

  _updateBrushVisual(pick) {
    if (!pick || this.tool === 'navigate') {
      this.brushCursor.visible = false;
      this.brushReach.visible = false;
      this.stampGhost.visible = false;
      return;
    }
    const isStamp = this.tool.startsWith('stamp:');
    if (isStamp) {
      const kind = LANDMASS_STAMP_KINDS.find((entry) => entry.id === this.stampKind);
      const radius = (kind?.defaultRadius || 4_000) * this.stampScale * 3.2;
      this.stampGhost.visible = true;
      this.stampGhost.position.set(pick.x, pick.y + 2, pick.z);
      this.stampGhost.scale.setScalar(Math.max(1, radius));
      this.brushCursor.visible = false;
      this.brushReach.visible = false;
      return;
    }
    this.stampGhost.visible = false;
    this.brushCursor.visible = true;
    this.brushReach.visible = true;
    const r = this.brush.radius;
    this.brushCursor.position.set(pick.x, pick.y + 1.5, pick.z);
    this.brushCursor.scale.setScalar(r);
    this.brushReach.position.set(pick.x, pick.y + 1.5, pick.z);
    this.brushReach.scale.setScalar(r * 2.3);
  }

  _handlePointerDown(event) {
    if (!this.active) return;
    if (event.button === 2 || event.button === 1) return;
    if (this.tool === 'navigate') return;
    const ndc = this._ndcFromEvent(event);
    const pick = this._pick(ndc.x, ndc.y);
    if (!pick) return;
    this.pointerDown = true;
    this.pointerMoved = false;

    if (this.tool.startsWith('stamp:')) {
      this._placeStamp(pick);
      return;
    }

    const layer = findLayer(this.doc, this.strokeLayerId) || this.doc.layers.find((entry) => entry.kind === 'sculpt');
    if (!layer) return;
    const stroke = createStroke({
      tool: this.tool,
      radius: this.brush.radius,
      strength: this.brush.strength,
      seed: (this.doc.revision * 7919 + Date.now()) >>> 0,
      target: this.tool === 'flatten' ? pick.y : null,
    });
    pushStrokePoint(stroke, pick.x, pick.z, 1);
    layer.ops.push(stroke);
    this.stroke = stroke;
    this.strokeLayerId = layer.id;
    if (this.tool === 'raise' || this.tool === 'lower') {
      // Map brush strength onto a sensible vertical rate in metres.
      stroke.strength = clamp(this.brush.strength * 1.4, 0.02, 3);
    }
    this._commitStrokePoint();
    touchDocument(this.doc);
    this.notifyDocumentChanged(stroke.bounds);
  }

  _handlePointerMove(event) {
    this.lastPointer = this._ndcFromEvent(event);
    const canvas = this.renderer.domElement;
    const overCanvas = event.target === canvas;
    if (!overCanvas && !this.pointerDown) return;
    if (this.pointerDown && this.stroke) {
      this.pointerMoved = true;
      const pick = this._pick(this.lastPointer.x, this.lastPointer.y);
      if (!pick) return;
      const minSpacing = this.brush.radius * 0.22;
      const added = pushStrokePoint(this.stroke, pick.x, pick.z, 1, minSpacing);
      if (added) {
        recomputeStrokeBounds(this.stroke);
        this._commitStrokePoint();
      }
      return;
    }
    this._queuePick();
  }

  _handlePointerUp() {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    if (this.stroke) {
      this._commitStrokePoint();
      this.stroke = null;
      touchDocument(this.doc);
      this.notifyDocumentChanged(null);
      if (this._onDocChanged) this._onDocChanged(this.doc);
    }
  }

  _commitStrokePoint() {
    // Mutating the stroke in place is what makes live sculpting authoring-cheap:
    // only the tiles under the newest segment get re-derived.
    const bounds = this.stroke?.bounds;
    if (!bounds) return;
    touchDocument(this.doc);
    this.field = createLandscapeField(this.doc);
    this.invalidateBounds(bounds);
    const throttle = 90;
    const now = nowMs();
    if (now - this.lastStrokeCommitAt > throttle) {
      this.lastStrokeCommitAt = now;
      this._queueOceanRefresh(400);
    }
  }

  _placeStamp(pick) {
    const kindEntry = LANDMASS_STAMP_KINDS.find((entry) => entry.id === this.stampKind) || LANDMASS_STAMP_KINDS[0];
    const radius = kindEntry.defaultRadius * this.stampScale;
    const height = kindEntry.defaultHeight * clamp(this.stampScale, 0.35, 3);
    const layer = this.doc.layers.find((entry) => entry.kind === 'landform')
      || this.doc.layers.find((entry) => entry.kind === 'landform' && entry.visible);
    if (!layer) return null;
    // A stamp is authored *relative to the surface*, so placing an island on a
    // shelf raises it from the sea floor instead of dropping a sphere at y=0.
    const negative = kindEntry.id === 'basin' || kindEntry.id === 'canyon' || kindEntry.id === 'strait';
    const stamp = addStamp(this.doc, layer.id, {
      kind: kindEntry.id,
      x: pick.x,
      z: pick.z,
      radius,
      height,
      negative,
      seed: (Date.now() ^ (this.doc.revision * 2654435761)) >>> 0,
    });
    this.notifyDocumentChanged(stamp.bounds);
    if (this._onDocChanged) this._onDocChanged(this.doc);
    return stamp;
  }

  _findCoastPoint() {
    const seaLevel = this._seaLevel();
    const span = this.doc.world.spanMeters;
    const step = Math.max(2_000, span / 90);
    for (let radius = step; radius < span * 0.5; radius += step) {
      for (let a = 0; a < 32; a++) {
        const angle = (a / 32) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const e = this.field.elevationAt(x, z, step * 0.5);
        if (e > seaLevel + 1 && e < seaLevel + 30) return { x, z };
      }
    }
    return { x: 0, z: 0 };
  }

  /**
   * Finds a point on land worth sculpting — the search starts at the planet's
   * own landmass instead of assuming the origin is above sea level.
   */
  _findLandPoint() {
    const seaLevel = this._seaLevel();
    const span = this.doc.world.spanMeters;
    const step = Math.max(1_500, span / 120);
    for (let radius = 0; radius < span * 0.5; radius += step) {
      const samples = radius === 0 ? 1 : 24;
      for (let a = 0; a < samples; a++) {
        const angle = (a / samples) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        // Coarse scan, then refine: a coarse sample can sit hundreds of metres
        // inside the surface, and framing the camera on it would bury the view.
        const coarse = this.field.elevationAt(x, z, step * 0.5);
        if (coarse <= seaLevel + Math.max(60, span * 0.0004)) continue;
        const y = this.field.elevationAt(x, z, Math.max(4, step * 0.01));
        return { x, y, z };
      }
    }
    const point = this._findCoastPoint();
    return { x: point.x, y: seaLevel, z: point.z };
  }

  _refreshLandFraction(force = false) {
    const now = nowMs();
    if (!force && now - (this._landFractionAt || 0) < 4_000) return;
    this._landFractionAt = now;
    this.stats.landFraction = estimateLandFraction(this.field, 40);
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  _focusFromCamera() {
    const target = this.controls.target;
    this.focus.set(target.x, target.z);
    const height = Math.abs(this.camera.position.y - target.y);
    const distToTarget = this.camera.position.distanceTo(target);
    this.viewDistance = clamp(Math.max(distToTarget * 6, height * 9, 2_500), 2_500, 3_600_000);
    this.stats.focusX = target.x;
    this.stats.focusZ = target.z;
    this.stats.altitude = this.camera.position.y;
  }

  _animate() {
    // The loop stays alive while the workspace is hidden so switching back is
    // instant; an inactive viewport renders nothing.
    this._rafHandle = requestAnimationFrame(this._animate);
    if (!this.active) return;

    const frameStart = nowMs();
    const delta = Math.min(0.1, (nowMs() - (this._lastFrameAt || nowMs())) / 1000);
    this._lastFrameAt = nowMs();
    this.time += delta;

    this.controls.update();
    this._focusFromCamera();

    // Sky dome follows the camera; it is a unit sphere, so it cannot be culled.
    this.skyDome.position.copy(this.camera.position);
    this.skyDome.scale.setScalar(Math.max(10_000, this.viewDistance * 3));

    this._refreshTiles();
    this._updateOcean(delta);

    this.renderer.render(this.scene, this.camera);

    this._frameTimes.push(nowMs() - frameStart);
    if (this._frameTimes.length > 30) this._frameTimes.shift();
    const avg = this._frameTimes.reduce((sum, value) => sum + value, 0) / this._frameTimes.length;
    this.stats.frameMs = avg;
    this.stats.fps = avg > 0 ? 1000 / avg : 0;
    const report = this.scheduler.report();
    this.stats.tiles = report.tiles;
    this.stats.queued = report.queued;
    this.stats.residentMb = report.megabytes;
    this.stats.budgetMb = report.budgetMegabytes;
    if (this._onStats) this._onStats(this.stats);
  }

  _updateOcean(delta) {
    if (!this.doc.ocean.enabled) return;
    const focus = this.focus;
    this.farOcean.position.set(0, 0, 0);
    this.farOceanMaterial.uniforms.uFocus.value.set(focus.x, 0, focus.y);
    this.farOceanMaterial.uniforms.uTime.value = this.time;
    this.farOceanMaterial.uniforms.uSwell.value.set(
      Math.cos((this.doc.ocean.swellDirectionDeg * Math.PI) / 180),
      Math.sin((this.doc.ocean.swellDirectionDeg * Math.PI) / 180),
      this.doc.ocean.waveHeight,
      this.doc.ocean.waveLength
    );
    this.farOcean.position.y = this._seaLevel();
    this.farOcean.visible = true;

    this.oceanSim.setOffset(focus.x, focus.y);
    this._applyOceanSettings();
    this.oceanSim.step(delta);
    this._oceanRecenterTimer = (this._oceanRecenterTimer || 0) + delta;
    if (this._oceanRecenterTimer > 1.4) {
      this._oceanRecenterTimer = 0;
      this._recentreOcean(false);
    }
  }
}
