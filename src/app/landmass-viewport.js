/**
 * Landmass Studio viewport.
 *
 * A deliberately simple third workspace for blocking out one broad
 * continent/island landmass and its ocean before detailed Terrain Studio
 * terrains are placed on it later. Terrain itself has no erosion system.
 * Its ocean is the Landmass adaptation of Terrain Studio's 2.5D virtual-
 * pipe water, with persistent simulated whitewater foam. It starts from a
 * freshly randomized base landmass.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  DEFAULT_LANDMASS_PARAMS,
  applyLandmassBrush,
  buildLandmassColors,
  computeLandmassStats,
  createRandomLandmassParams,
  extractShorelineContours,
  generateLandmass,
  normalizeLandmassParams,
  sampleLandmassHeight,
} from '../core/landmass.js';
import { LandmassOceanSimulation } from './landmass-ocean.js';

function byId(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// The heightfield's worldSpan is real metres. Rendering uses this fixed
// scene span and converts physical <-> scene coordinates at the picking,
// brush, camera, shoreline, and ocean-surface boundaries; that avoids
// pretending a label changed the data while also avoiding float32 jitter
// at a 40,075,000 m world width.
const DISPLAY_SPAN = 2400;
const WORLD_SPAN_MIN_M = 400;
const WORLD_SPAN_MAX_M = 40075000;

function formatKm(km) {
  const value = Number(km);
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return `${Math.round(value).toLocaleString('en-US')} km`;
  if (value >= 100) return `${Math.round(value)} km`;
  if (value >= 10) return `${value.toFixed(1)} km`;
  if (value >= 1) return `${value.toFixed(2)} km`;
  return `${Math.round(value * 1000)} m`;
}

function worldSpanToSlider(meters) {
  const safe = clamp(Number(meters) || WORLD_SPAN_MAX_M, WORLD_SPAN_MIN_M, WORLD_SPAN_MAX_M);
  return (Math.log(safe) - Math.log(WORLD_SPAN_MIN_M))
    / (Math.log(WORLD_SPAN_MAX_M) - Math.log(WORLD_SPAN_MIN_M));
}

function sliderToWorldSpan(t) {
  const safe = clamp(Number(t) || 0, 0, 1);
  return Math.exp(
    Math.log(WORLD_SPAN_MIN_M)
    + (Math.log(WORLD_SPAN_MAX_M) - Math.log(WORLD_SPAN_MIN_M)) * safe
  );
}

export class LandmassStudioViewport {
  constructor(container) {
    this.container = container;
    this.params = createRandomLandmassParams(Math.random, { worldSpan: WORLD_SPAN_MAX_M });
    this.field = generateLandmass(this.params);
    this.view = {
      seaLevel: 0,
      showOcean: true,
      oceanOpacity: 0.78,
      showFoam: true,
      waveHeight: 0.75,
      waveLength: 145,
      waveDirection: -35,
      surfStrength: 1,
      foamLifetime: 8.5,
      oceanSpeed: 1,
      waterResolution: 256,
      wireframe: false,
    };
    this.tool = 'navigate';
    this.brush = { radius: 190, strength: 3.2 };
    this.active = false;
    this._strokeDown = false;
    this._lastBrushPoint = null;
    this._flattenTarget = 0;
    this._terrainDirty = false;
    this._oceanSyncTimer = null;
    this._shorelineContours = [];
    this._shorelineLength = 0;
    this._lastStatsAt = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#101820');
    this.scene.fog = new THREE.FogExp2('#101820', 0.00011);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, width / Math.max(1, height), 1, 16000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 45;
    this.controls.maxDistance = 8000;

    this.raycaster = new THREE.Raycaster();
    this._clock = new THREE.Clock();

    this._initLights();
    this._initTerrain();
    this._initOcean();
    this._updateShoreline();
    this._initBrushCursor();
    this._bindPointer();
    this._bindControls();
    this.frameCamera('overview');
    this._updateStats();

    this._onResize = () => {
      if (this.active) this.resize();
    };
    window.addEventListener('resize', this._onResize);
    this._animate = this._animate.bind(this);
    this._animate();
  }

  setActive(flag) {
    this.active = Boolean(flag);
    this.controls.enabled = this.active;
    if (this.active) {
      this._clock.getDelta();
      this.resize();
    } else {
      this._strokeDown = false;
      if (this.brushCursor) this.brushCursor.visible = false;
    }
  }

  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _renderScale() {
    const physicalMeters = Math.max(1, this.field?.worldSpan || this.params.worldSpan || DISPLAY_SPAN);
    return DISPLAY_SPAN / physicalMeters;
  }

  _formatPhysicalLength(physicalMeters) {
    return formatKm((Number(physicalMeters) || 0) / 1000);
  }

  _formatDisplayLength(displayUnits) {
    return this._formatPhysicalLength((Number(displayUnits) || 0) / Math.max(this._renderScale(), 1e-12));
  }

  _initLights() {
    const span = DISPLAY_SPAN;
    this.sun = new THREE.DirectionalLight('#fff2dc', 2.8);
    this.sun.position.set(-span * 0.48, span * 0.72, span * 0.28);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -span * 0.68;
    this.sun.shadow.camera.right = span * 0.68;
    this.sun.shadow.camera.top = span * 0.68;
    this.sun.shadow.camera.bottom = -span * 0.68;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = span * 2.4;
    this.sun.shadow.bias = -0.00018;
    this.sun.shadow.normalBias = 1.4;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.scene.add(new THREE.HemisphereLight('#b7cee2', '#51483b', 0.78));
    const rim = new THREE.DirectionalLight('#8fb0d8', 0.35);
    rim.position.set(span * 0.5, span * 0.28, -span * 0.45);
    this.scene.add(rim);
  }

  _buildTerrainGeometry() {
    const size = this.field.size;
    // Vertex XZ are scene units; sampling and measurements remain in the
    // field's real metre coordinates.
    const span = DISPLAY_SPAN;
    const positions = new Float32Array(size * size * 3);
    const colors = buildLandmassColors(this.field, this.view.seaLevel);
    const indices = new Uint32Array((size - 1) * (size - 1) * 6);

    let p = 0;
    for (let iz = 0; iz < size; iz++) {
      const z = (iz / Math.max(1, size - 1) - 0.5) * span;
      for (let ix = 0; ix < size; ix++) {
        const x = (ix / Math.max(1, size - 1) - 0.5) * span;
        positions[p++] = x;
        positions[p++] = this.field.heights[iz * size + ix];
        positions[p++] = z;
      }
    }

    let q = 0;
    for (let iz = 0; iz < size - 1; iz++) {
      for (let ix = 0; ix < size - 1; ix++) {
        const a = iz * size + ix;
        const b = a + 1;
        const c = a + size;
        const d = c + 1;
        indices[q++] = a;
        indices[q++] = c;
        indices[q++] = b;
        indices[q++] = b;
        indices[q++] = c;
        indices[q++] = d;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    return geometry;
  }

  _initTerrain() {
    const geometry = this._buildTerrainGeometry();
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
    });
    this.terrainMesh = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrainMesh.castShadow = true;
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  _refreshTerrainGeometry() {
    if (!this.terrainMesh) return;
    const geometry = this.terrainMesh.geometry;
    if (geometry.attributes.position.count !== this.field.heights.length) {
      const oldGeometry = geometry;
      this.terrainMesh.geometry = this._buildTerrainGeometry();
      oldGeometry.dispose();
      this._terrainDirty = false;
      return;
    }
    const positions = geometry.attributes.position.array;
    const colors = buildLandmassColors(this.field, this.view.seaLevel);
    for (let i = 0; i < this.field.heights.length; i++) {
      positions[i * 3 + 1] = this.field.heights[i];
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    this._terrainDirty = false;
  }

  _initOcean() {
    const span = DISPLAY_SPAN;
    const seabedGeometry = new THREE.CircleGeometry(span * 1.7, 96);
    seabedGeometry.rotateX(-Math.PI / 2);
    this.seabedMesh = new THREE.Mesh(
      seabedGeometry,
      new THREE.MeshStandardMaterial({ color: '#17262d', roughness: 1, metalness: 0 })
    );
    this.seabedMesh.position.y = -this.params.oceanDepth - 3;
    this.scene.add(this.seabedMesh);

    // A calm far-ocean disc only extends the simulated square to the
    // horizon. All coast water and foam inside the landmass domain comes
    // from LandmassOceanSimulation's 2.5D virtual-pipe state.
    const oceanGeometry = new THREE.CircleGeometry(span * 1.7, 128);
    oceanGeometry.rotateX(-Math.PI / 2);
    this.oceanMaterial = new THREE.MeshStandardMaterial({
      color: '#176f8f',
      roughness: 0.3,
      metalness: 0.04,
      transparent: true,
      opacity: this.view.oceanOpacity,
      depthWrite: false,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeometry, this.oceanMaterial);
    this.oceanMesh.position.y = this.view.seaLevel - 0.06;
    this.oceanMesh.renderOrder = 2;
    this.scene.add(this.oceanMesh);

    this.ocean = this._createOceanSimulation();
  }

  _createOceanSimulation() {
    return new LandmassOceanSimulation(this.renderer, this.scene, this.field, {
      resolution: this.view.waterResolution,
      displaySpan: DISPLAY_SPAN,
      seaLevel: this.view.seaLevel,
      opacity: this.view.oceanOpacity,
      waveHeight: this.view.waveHeight,
      waveLength: this.view.waveLength,
      waveDirection: this.view.waveDirection,
      surfStrength: this.view.surfStrength,
      foamLifetime: this.view.foamLifetime,
      speed: this.view.oceanSpeed,
      enabled: this.view.showOcean,
      showFoam: this.view.showFoam,
    });
  }

  _recreateOceanSimulation() {
    const previous = this.ocean;
    this.ocean = this._createOceanSimulation();
    previous?.dispose?.();
  }

  _updateShoreline() {
    this._shorelineContours = extractShorelineContours(this.field, this.view.seaLevel);
    this._shorelineLength = this._shorelineContours.reduce((sum, contour) => sum + contour.length, 0);
  }

  _scheduleOceanBedSync(immediate = false) {
    if (!this.ocean) return;
    if (immediate) {
      if (this._oceanSyncTimer) {
        clearTimeout(this._oceanSyncTimer);
        this._oceanSyncTimer = null;
      }
      this.ocean.syncBed(true);
      this._updateShoreline();
      this._updateStats();
      return;
    }
    if (this._oceanSyncTimer) return;
    this._oceanSyncTimer = setTimeout(() => {
      this._oceanSyncTimer = null;
      this.ocean?.syncBed(true);
      this._updateShoreline();
    }, 145);
  }

  _initBrushCursor() {
    const geometry = new THREE.RingGeometry(0.93, 1, 72);
    geometry.rotateX(-Math.PI / 2);
    this.brushCursor = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: '#ffd166',
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    this.brushCursor.renderOrder = 10;
    this.brushCursor.visible = false;
    this.scene.add(this.brushCursor);
  }

  setTool(tool) {
    this.tool = ['navigate', 'raise', 'lower', 'smooth', 'flatten'].includes(tool) ? tool : 'navigate';
    const sculpting = this.tool !== 'navigate';
    this.controls.mouseButtons = sculpting
      ? { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    if (!sculpting && this.brushCursor) this.brushCursor.visible = false;
    document.querySelectorAll('[data-lm-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.lmTool === this.tool);
    });
  }

  frameCamera(mode = 'overview') {
    const span = DISPLAY_SPAN;
    if (mode === 'top') {
      this.camera.position.set(0, span * 1.24, 0.01);
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'coast') {
      const contour = this._shorelineContours?.[0];
      const physicalPoint = contour?.points?.[Math.floor(contour.points.length * 0.35)];
      if (physicalPoint) {
        // extractShorelineContours returns physical metres; convert once
        // here so camera framing stays in the 2,400-unit scene domain.
        const scale = this._renderScale();
        const point = [physicalPoint[0] * scale, physicalPoint[1] * scale];
        const len = Math.hypot(point[0], point[1]) || 1;
        const outX = point[0] / len;
        const outZ = point[1] / len;
        this.controls.target.set(point[0], this.view.seaLevel, point[1]);
        this.camera.position.set(
          point[0] + outX * span * 0.24,
          this.view.seaLevel + span * 0.11,
          point[1] + outZ * span * 0.24
        );
      } else {
        this.frameCamera('overview');
        return;
      }
    } else {
      this.camera.position.set(span * 0.62, span * 0.48, span * 0.74);
      this.controls.target.set(0, 0, 0);
    }
    this.controls.update();
  }

  _setWorldSpan(nextWorldSpan) {
    this.params = normalizeLandmassParams({ ...this.params, worldSpan: nextWorldSpan });
    // Rescale the existing physical field instead of regenerating it, so
    // changing world size preserves sculpting while every metre-based
    // sample, brush, shoreline, and cell measurement uses the new span.
    this.field.worldSpan = this.params.worldSpan;
    if (this.field.params) this.field.params.worldSpan = this.params.worldSpan;
    this._refreshTerrainGeometry();
    this.ocean?.setField(this.field, false);
    this._updateShoreline();
    this._updateStats();
  }

  regenerate(nextParams = this.params) {
    this.params = normalizeLandmassParams(nextParams);
    this.field = generateLandmass(this.params);
    this.seabedMesh.position.y = -this.params.oceanDepth - 3;
    this._refreshTerrainGeometry();
    // Land resolution no longer dictates water resolution. Rebuild only
    // when the independently selected water grid differs; otherwise the
    // ocean simply resamples the regenerated physical bed.
    if (this.ocean && this.ocean.size !== this.view.waterResolution) {
      this._recreateOceanSimulation();
    } else {
      this.ocean?.setField(this.field, true);
    }
    this._updateShoreline();
    this._updateStats();
  }

  _pickTerrain(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    const span = DISPLAY_SPAN;
    const half = span * 0.5;
    const renderScale = this._renderScale();
    const cell = span / Math.max(1, this.field.size - 1);
    const step = Math.max(3, cell * 0.72);
    const maxDistance = span * 4.5;
    let prevT = null;
    let prevD = null;

    const clearance = (t) => {
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      // The ray is in scene units; the heightfield is in physical metres.
      return y - sampleLandmassHeight(this.field, x / renderScale, z / renderScale);
    };

    for (let t = 0; t <= maxDistance; t += step) {
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      if (Math.abs(x) > half || Math.abs(z) > half) {
        prevT = null;
        prevD = null;
        continue;
      }
      const d = clearance(t);
      if (prevT !== null && prevD >= 0 && d <= 0) {
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) * 0.5;
          if (clearance(mid) >= 0) lo = mid;
          else hi = mid;
        }
        const hitT = (lo + hi) * 0.5;
        const hx = origin.x + direction.x * hitT;
        const hz = origin.z + direction.z * hitT;
        return new THREE.Vector3(
          hx,
          sampleLandmassHeight(this.field, hx / renderScale, hz / renderScale),
          hz
        );
      }
      prevT = t;
      prevD = d;
    }

    if (Math.abs(direction.y) > 1e-5) {
      const t = (this.view.seaLevel - origin.y) / direction.y;
      if (t >= 0) {
        const x = origin.x + direction.x * t;
        const z = origin.z + direction.z * t;
        if (Math.abs(x) <= half && Math.abs(z) <= half) {
          return new THREE.Vector3(x, sampleLandmassHeight(this.field, x / renderScale, z / renderScale), z);
        }
      }
    }
    return null;
  }

  _applyBrushAt(point) {
    if (!point || this.tool === 'navigate') return;
    const protectBorder = ['continent', 'island', 'archipelago'].includes(this.params.shape);
    const renderScale = Math.max(this._renderScale(), 1e-12);
    const result = applyLandmassBrush(this.field, {
      // Cursor point/radius are scene units; brush itself operates on the
      // field's real metre coordinates.
      x: point.x / renderScale,
      z: point.z / renderScale,
      radius: this.brush.radius / renderScale,
      strength: this.brush.strength,
      mode: this.tool,
      targetHeight: this._flattenTarget,
      protectBorder,
      seaLevel: this.view.seaLevel,
    });
    if (result.changed > 0) {
      this._terrainDirty = true;
      this._scheduleOceanBedSync(false);
    }
  }

  _applyBrushStroke(point) {
    if (!this._lastBrushPoint) {
      this._applyBrushAt(point);
      this._lastBrushPoint = point.clone();
      return;
    }
    const spacing = Math.max(4, this.brush.radius * 0.32);
    const distance = this._lastBrushPoint.distanceTo(point);
    const steps = Math.max(1, Math.min(18, Math.ceil(distance / spacing)));
    for (let i = 1; i <= steps; i++) {
      const p = this._lastBrushPoint.clone().lerp(point, i / steps);
      p.y = sampleLandmassHeight(this.field, p.x, p.z);
      this._applyBrushAt(p);
    }
    this._lastBrushPoint = point.clone();
  }

  _updateBrushCursor(point) {
    if (!this.brushCursor) return;
    if (!point || this.tool === 'navigate') {
      this.brushCursor.visible = false;
      return;
    }
    this.brushCursor.visible = true;
    this.brushCursor.position.set(point.x, Math.max(point.y, this.view.seaLevel) + 1.1, point.z);
    this.brushCursor.scale.setScalar(this.brush.radius);
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (event) => {
      if (!this.active || this.tool === 'navigate' || event.button !== 0) return;
      const point = this._pickTerrain(event);
      if (!point) return;
      event.preventDefault();
      this._strokeDown = true;
      this._lastBrushPoint = null;
      this._flattenTarget = point.y;
      this.controls.enabled = false;
      el.setPointerCapture?.(event.pointerId);
      this._applyBrushStroke(point);
      this._updateBrushCursor(point);
    });

    el.addEventListener('pointermove', (event) => {
      if (!this.active || this.tool === 'navigate') return;
      const point = this._pickTerrain(event);
      this._updateBrushCursor(point);
      if (this._strokeDown && point) this._applyBrushStroke(point);
    });

    const finishStroke = () => {
      if (!this._strokeDown) return;
      this._strokeDown = false;
      this._lastBrushPoint = null;
      this.controls.enabled = this.active;
      if (this._terrainDirty) this._refreshTerrainGeometry();
      this._scheduleOceanBedSync(true);
      this._updateStats();
    };
    el.addEventListener('pointerup', finishStroke);
    el.addEventListener('pointercancel', finishStroke);
    el.addEventListener('pointerleave', () => {
      if (!this._strokeDown) this._updateBrushCursor(null);
    });
  }

  _updateStats() {
    const stats = computeLandmassStats(this.field, this.view.seaLevel);
    this.field.stats = stats;
    const set = (id, value) => {
      const el = byId(id);
      if (el) el.textContent = value;
    };
    set('lm-stat-land', `${Math.round(stats.landFraction * 100)}%`);
    set('lm-stat-shore', this._formatPhysicalLength(this._shorelineLength || 0));
    set('lm-stat-foam', `${this.ocean?.size || this.view.waterResolution}² · ${this.ocean?.stepsPerSecond || 0}/s`);
    set('lm-stat-elev', `${Math.round(stats.minHeight)}…${Math.round(stats.maxHeight)} m`);
    const readout = byId('lm-readout');
    if (readout) {
      const landCellKm = (this.field.worldSpan / 1000) / Math.max(1, this.field.size - 1);
      const waterCellKm = (this.field.worldSpan / 1000) / Math.max(1, (this.ocean?.size || this.view.waterResolution) - 1);
      readout.textContent =
        `${this.params.shape} · ${formatKm(this.field.worldSpan / 1000)} flat world · ${this.field.size}² land (${formatKm(landCellKm)}/cell) · ` +
        `${this.ocean?.size || this.view.waterResolution}² water (${formatKm(waterCellKm)}/cell) · ` +
        `seed ${this.params.seed} · ${this._shorelineContours.length} shoreline contour(s). ` +
        'Ocean uses Terrain Studio-style 2.5D virtual-pipe water. Whitewater foam is a persistent simulated state ' +
        'created by breaking, beach uprush and steep-shore impact, then advected and decayed by the water—not a foam ' +
        'noise pattern and not particles. Detailed terrains can be placed on this base in a later step.';
    }
  }

  _bindControls() {
    const syncShapeCards = () => {
      document.querySelectorAll('[data-lm-shape]').forEach((button) => {
        button.classList.toggle('active', button.dataset.lmShape === this.params.shape);
      });
      const select = byId('lm-shape');
      if (select) select.value = this.params.shape;
    };

    const syncGeneratorInputs = () => {
      const setRange = (id, outputId, value, formatter) => {
        const input = byId(id);
        const output = byId(outputId);
        if (input) input.value = String(value);
        if (output) output.textContent = formatter(Number(value));
      };
      const seed = byId('lm-seed');
      if (seed) seed.value = String(this.params.seed);
      setRange('lm-world-size', 'lm-out-world-size', worldSpanToSlider(this.params.worldSpan), (v) => `${formatKm(sliderToWorldSpan(v) / 1000)} across`);
      setRange('lm-world-resolution', 'lm-out-world-resolution', this.params.gridSize, (v) => `${Math.round(v)}²`);
      setRange('lm-water-resolution', 'lm-out-water-resolution', this.view.waterResolution, (v) => `${Math.round(v)}²`);
      setRange('lm-land-coverage', 'lm-out-land-coverage', this.params.landCoverage, (v) => `${Math.round(v * 100)}%`);
      setRange('lm-coast-roughness', 'lm-out-coast-roughness', this.params.coastRoughness, (v) => `${Math.round(v * 100)}%`);
      setRange('lm-relief', 'lm-out-relief', this.params.relief, (v) => `${Math.round(v)} m`);
      setRange('lm-roughness', 'lm-out-roughness', this.params.roughness, (v) => `${Math.round(v * 100)}%`);
      setRange('lm-ocean-depth', 'lm-out-ocean-depth', this.params.oceanDepth, (v) => `${Math.round(v)} m`);
      syncShapeCards();
    };

    const bindRange = (id, outputId, formatter, onInput) => {
      const input = byId(id);
      const output = byId(outputId);
      if (!input) return;
      const update = () => {
        const value = Number(input.value);
        if (output) output.textContent = formatter(value);
        onInput(value);
      };
      input.addEventListener('input', update);
      if (output) output.textContent = formatter(Number(input.value));
    };

    syncGeneratorInputs();
    const worldSizeInput = byId('lm-world-size');
    const worldSizeOutput = byId('lm-out-world-size');
    worldSizeInput?.addEventListener('input', () => {
      const nextWorldSpan = sliderToWorldSpan(Number(worldSizeInput.value));
      if (worldSizeOutput) worldSizeOutput.textContent = `${formatKm(nextWorldSpan / 1000)} across`;
    });
    worldSizeInput?.addEventListener('change', () => {
      const nextWorldSpan = Math.round(sliderToWorldSpan(Number(worldSizeInput.value)));
      if (nextWorldSpan !== Math.round(this.params.worldSpan)) {
        this._setWorldSpan(nextWorldSpan);
        const brushOutput = byId('lm-out-brush-radius');
        if (brushOutput) brushOutput.textContent = this._formatDisplayLength(this.brush.radius);
      }
    });
    const resolutionInput = byId('lm-world-resolution');
    const resolutionOutput = byId('lm-out-world-resolution');
    resolutionInput?.addEventListener('input', () => {
      if (resolutionOutput) resolutionOutput.textContent = `${Math.round(Number(resolutionInput.value) || 256)}²`;
    });
    resolutionInput?.addEventListener('change', () => {
      const nextResolution = Math.round(clamp(Number(resolutionInput.value) || 256, 128, 512));
      if (nextResolution !== this.params.gridSize) {
        this.params.gridSize = nextResolution;
        this.regenerate(this.params);
      }
    });
    const waterResolutionInput = byId('lm-water-resolution');
    const waterResolutionOutput = byId('lm-out-water-resolution');
    waterResolutionInput?.addEventListener('input', () => {
      if (waterResolutionOutput) waterResolutionOutput.textContent = `${Math.round(Number(waterResolutionInput.value) || 256)}²`;
    });
    waterResolutionInput?.addEventListener('change', () => {
      const nextWaterResolution = Math.round(clamp(Number(waterResolutionInput.value) || 256, 128, 1024));
      if (nextWaterResolution !== this.view.waterResolution) {
        this.view.waterResolution = nextWaterResolution;
        this._recreateOceanSimulation();
        this._updateStats();
      }
    });
    bindRange('lm-land-coverage', 'lm-out-land-coverage', (v) => `${Math.round(v * 100)}%`, (v) => { this.params.landCoverage = v; });
    bindRange('lm-coast-roughness', 'lm-out-coast-roughness', (v) => `${Math.round(v * 100)}%`, (v) => { this.params.coastRoughness = v; });
    bindRange('lm-relief', 'lm-out-relief', (v) => `${Math.round(v)} m`, (v) => { this.params.relief = v; });
    bindRange('lm-roughness', 'lm-out-roughness', (v) => `${Math.round(v * 100)}%`, (v) => { this.params.roughness = v; });
    bindRange('lm-ocean-depth', 'lm-out-ocean-depth', (v) => `${Math.round(v)} m`, (v) => { this.params.oceanDepth = v; });

    bindRange('lm-brush-radius', 'lm-out-brush-radius', (v) => this._formatDisplayLength(v), (v) => { this.brush.radius = v; });
    bindRange('lm-brush-strength', 'lm-out-brush-strength', (v) => `${Number(v).toFixed(1)} m`, (v) => { this.brush.strength = v; });

    bindRange('lm-sea-level', 'lm-out-sea-level', (v) => `${Math.round(v)} m`, (v) => {
      this.view.seaLevel = v;
      this.oceanMesh.position.y = v - 0.06;
      this.ocean?.setParams({ seaLevel: v });
      this._refreshTerrainGeometry();
      this._scheduleOceanBedSync(false);
    });
    byId('lm-sea-level')?.addEventListener('change', (event) => {
      const v = Number(event.target.value) || 0;
      this.view.seaLevel = v;
      this.ocean?.setSeaLevel(v, true);
      this._updateShoreline();
      this._updateStats();
    });
    bindRange('lm-ocean-opacity', 'lm-out-ocean-opacity', (v) => `${Math.round(v * 100)}%`, (v) => {
      this.view.oceanOpacity = clamp(v, 0.05, 1);
      this.oceanMaterial.opacity = this.view.oceanOpacity;
      this.ocean?.setParams({ opacity: this.view.oceanOpacity });
    });
    bindRange('lm-wave-height', 'lm-out-wave-height', (v) => `${Number(v).toFixed(2)} m`, (v) => {
      this.view.waveHeight = v;
      this.ocean?.setParams({ waveHeight: v });
    });
    bindRange('lm-wave-length', 'lm-out-wave-length', (v) => `${Math.round(v)} m`, (v) => {
      this.view.waveLength = v;
      this.ocean?.setParams({ waveLength: v });
    });
    bindRange('lm-wave-direction', 'lm-out-wave-direction', (v) => `${Math.round(v)}°`, (v) => {
      this.view.waveDirection = v;
      this.ocean?.setParams({ waveDirection: v });
    });
    bindRange('lm-surf-strength', 'lm-out-surf-strength', (v) => `${Number(v).toFixed(1)}×`, (v) => {
      this.view.surfStrength = v;
      this.ocean?.setParams({ surfStrength: v });
    });
    bindRange('lm-foam-lifetime', 'lm-out-foam-lifetime', (v) => `${Number(v).toFixed(1)} s`, (v) => {
      this.view.foamLifetime = v;
      this.ocean?.setParams({ foamLifetime: v });
    });
    bindRange('lm-ocean-speed', 'lm-out-ocean-speed', (v) => `${Number(v).toFixed(1)}×`, (v) => {
      this.view.oceanSpeed = v;
      this.ocean?.setParams({ speed: v });
    });

    const shapeSelect = byId('lm-shape');
    shapeSelect?.addEventListener('change', () => {
      this.params.shape = shapeSelect.value;
      syncShapeCards();
    });
    document.querySelectorAll('[data-lm-shape]').forEach((button) => {
      button.addEventListener('click', () => {
        this.params.shape = button.dataset.lmShape;
        syncShapeCards();
        this.regenerate(this.params);
      });
    });

    const seedInput = byId('lm-seed');
    seedInput?.addEventListener('change', () => {
      this.params.seed = Math.round(Number(seedInput.value) || DEFAULT_LANDMASS_PARAMS.seed) >>> 0;
      seedInput.value = String(this.params.seed);
    });
    byId('lm-generate')?.addEventListener('click', () => {
      if (seedInput) this.params.seed = Math.round(Number(seedInput.value) || DEFAULT_LANDMASS_PARAMS.seed) >>> 0;
      this.regenerate(this.params);
    });
    byId('lm-random-seed')?.addEventListener('click', () => {
      this.params = createRandomLandmassParams(Math.random, this.params);
      syncGeneratorInputs();
      this.regenerate(this.params);
    });
    byId('lm-reset-sculpt')?.addEventListener('click', () => this.regenerate(this.params));

    document.querySelectorAll('[data-lm-tool]').forEach((button) => {
      button.addEventListener('click', () => this.setTool(button.dataset.lmTool));
    });
    document.querySelectorAll('[data-lm-cam]').forEach((button) => {
      button.addEventListener('click', () => this.frameCamera(button.dataset.lmCam));
    });

    const showOcean = byId('lm-show-ocean');
    showOcean?.addEventListener('change', () => {
      this.view.showOcean = showOcean.checked;
      this.oceanMesh.visible = this.view.showOcean;
      this.ocean?.setParams({ enabled: this.view.showOcean });
    });
    const showFoam = byId('lm-show-foam');
    showFoam?.addEventListener('change', () => {
      this.view.showFoam = showFoam.checked;
      this.ocean?.setParams({ showFoam: this.view.showFoam });
    });
    const wireframe = byId('lm-wireframe');
    wireframe?.addEventListener('change', () => {
      this.view.wireframe = wireframe.checked;
      this.terrainMaterial.wireframe = this.view.wireframe;
    });

    syncShapeCards();
    this.setTool('navigate');
  }

  _animate() {
    requestAnimationFrame(this._animate);
    if (!this.active) return;
    const delta = this._clock.getDelta();
    this.controls.update();
    if (this._terrainDirty) this._refreshTerrainGeometry();
    this.ocean?.update(delta);
    const now = performance.now();
    if (now - this._lastStatsAt > 800) {
      this._lastStatsAt = now;
      this._updateStats();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
