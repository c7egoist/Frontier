// Scene / renderer / lighting rig with day-night presets, shadows and bloom.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TT from './lib/textures.js';

export const TIME_PRESETS = {
  noon: {
    label: 'Midday',
    sky: ['#7fb2e5', '#bcd8ef', '#e8f0f4'],
    sun: '#fff6e6',
    sunIntensity: 2.6,
    sunPos: [0.55, 0.85, 0.35],
    hemi: ['#bcd8ef', '#8a8577'],
    hemiIntensity: 0.85,
    ambient: 0.35,
    exposure: 0.95,
    fog: '#c9d9e6',
    fogDensity: 0.0075,
    bloom: 0.25,
  },
  golden: {
    label: 'Golden hour',
    sky: ['#2e4a7a', '#b07a86', '#e8a866'],
    sun: '#ffc07a',
    sunIntensity: 2.2,
    sunPos: [-0.9, 0.22, 0.35],
    hemi: ['#e0b58a', '#6b6355'],
    hemiIntensity: 0.6,
    ambient: 0.28,
    exposure: 1.0,
    fog: '#c69a7e',
    fogDensity: 0.012,
    bloom: 0.5,
  },
  dusk: {
    label: 'Dusk',
    sky: ['#1d2a52', '#4a4a72', '#c07a5c'],
    sun: '#ff9a5c',
    sunIntensity: 1.1,
    sunPos: [-0.95, 0.08, 0.2],
    hemi: ['#5566aa', '#3a3a3a'],
    hemiIntensity: 0.45,
    ambient: 0.22,
    exposure: 1.05,
    fog: '#4a4a68',
    fogDensity: 0.016,
    bloom: 0.85,
  },
  night: {
    label: 'Night',
    sky: ['#070b16', '#101a33', '#2a2f45'],
    sun: '#9dc0ff',
    sunIntensity: 0.35,
    sunPos: [0.4, 0.7, -0.5],
    hemi: ['#1b2740', '#0d0f16'],
    hemiIntensity: 0.35,
    ambient: 0.16,
    exposure: 1.15,
    fog: '#111726',
    fogDensity: 0.02,
    bloom: 1.35,
  },
  overcast: {
    label: 'Overcast',
    sky: ['#98a5b0', '#c2c9cf', '#dfe3e6'],
    sun: '#eef1f3',
    sunIntensity: 1.2,
    sunPos: [0.2, 0.95, 0.3],
    hemi: ['#c8d0d6', '#8b8b85'],
    hemiIntensity: 1.05,
    ambient: 0.5,
    exposure: 0.95,
    fog: '#c2c9cf',
    fogDensity: 0.01,
    bloom: 0.2,
  },
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, (container.clientWidth || 800) / (container.clientHeight || 600), 0.1, 800);
    this.camera.position.set(14, 9, 18);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 160;
    this.controls.target.set(0, 5, 0);

    // --- environment (IBL) ---
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // --- lights ---
    this.sun = new THREE.DirectionalLight('#fff6e6', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    const sc = this.sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight('#bcd8ef', '#8a8577', 0.85);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.3);
    this.scene.add(this.ambient);

    // --- ground ---
    this.groundMat = new THREE.MeshStandardMaterial({
      color: '#8f8a7c',
      roughness: 0.96,
      metalness: 0.0,
      map: TT.earthTexture(),
    });
    if (this.groundMat.map) {
      this.groundMat.map.repeat.set(24, 24);
    }
    this.groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    this.groundPlane.name = 'Ground';
    this.scene.add(this.groundPlane);

    this.grid = new THREE.GridHelper(120, 120, 0x6f7b86, 0x54606b);
    this.grid.position.y = 0.012;
    this.grid.material.opacity = 0.35;
    this.grid.material.transparent = true;
    this.grid.visible = false;
    this.scene.add(this.grid);

    // --- post-processing ---
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth || 800, container.clientHeight || 600), 0.6, 0.7, 0.85);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.bloomEnabled = true;

    this.clock = new THREE.Clock();
    this.frames = 0;
    this.fpsAccum = 0;
    this.fps = 0;
    this.needsRender = true;
    this._resizeObs = null;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver) {
      this._resizeObs = new ResizeObserver(() => this.resize());
      this._resizeObs.observe(container);
    }
    this.setTimePreset('golden');
    this.animate();
  }

  setTimePreset(key) {
    const p = TIME_PRESETS[key] || TIME_PRESETS.golden;
    this.timePreset = key;
    const [top, mid, bottom] = p.sky;
    const tex = TT.skyTexture(top, mid, bottom);
    if (this.scene.background && this.scene.background.isTexture && this.scene.background !== tex) this.scene.background.dispose?.();
    this.scene.background = tex;
    this.scene.backgroundBlurriness = 0.35;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(p.fog), p.fogDensity);
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity;
    const dir = new THREE.Vector3(...p.sunPos).normalize().multiplyScalar(60);
    this.sun.position.copy(dir);
    this.hemi.color.set(p.hemi[0]);
    this.hemi.groundColor.set(p.hemi[1]);
    this.hemi.intensity = p.hemiIntensity;
    this.ambient.intensity = p.ambient;
    this.renderer.toneMappingExposure = p.exposure;
    if (this.bloomPass) this.bloomPass.strength = this.bloomEnabled ? p.bloom : 0;
    this.needsRender = true;
  }

  setBloom(on, strength) {
    this.bloomEnabled = on;
    const p = TIME_PRESETS[this.timePreset] || TIME_PRESETS.golden;
    if (this.bloomPass) this.bloomPass.strength = on ? (strength ?? p.bloom) : 0;
    this.needsRender = true;
  }

  setGroundVisible(v) {
    this.groundPlane.visible = v;
    this.needsRender = true;
  }

  setGridVisible(v) {
    this.grid.visible = v;
    this.needsRender = true;
  }

  /** Replace the content under a root group. */
  setContent(object) {
    if (this.content) {
      this.scene.remove(this.content);
      this.content.traverse?.((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
    }
    this.content = object;
    if (object) this.scene.add(object);
    this.needsRender = true;
  }

  /** Attach dynamic lights from the generator. */
  setBuildingLights(descriptors, budget = 10) {
    if (this.buildingLights) {
      for (const l of this.buildingLights) {
        l.parent?.remove(l);
        l.dispose?.();
      }
    }
    this.buildingLights = [];
    if (!descriptors || !descriptors.length) {
      this.needsRender = true;
      return;
    }
    // keep the strongest/most relevant ones for performance
    const sorted = descriptors.slice(0, budget);
    for (const d of sorted) {
      const light = new THREE.PointLight(new THREE.Color(d.color || '#ffcf8f'), d.intensity ?? 5, d.distance ?? 12, 2);
      light.position.set(d.pos[0], d.pos[1], d.pos[2]);
      light.castShadow = false;
      this.scene.add(light);
      this.buildingLights.push(light);
    }
    this.needsRender = true;
  }

  frameObject(object, fit = 1.15) {
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = (maxDim / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * fit * 1.35;
    const dir = new THREE.Vector3(0.75, 0.42, 1).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center).setY(center.y * 0.72);
    this.camera.near = Math.max(0.1, dist / 200);
    this.camera.far = Math.max(400, dist * 12);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.needsRender = true;
    this.lastFit = { center, dist };
  }

  focusOn(x, z, y = 1.6) {
    this.controls.target.set(x, y, z);
    this.needsRender = true;
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  animate = () => {
    this._raf = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    const moving = this.controls.update();
    // keep the shadow camera tight on the content
    if (this.content && this._shadowTimer !== Math.floor(this.clock.elapsedTime * 2)) {
      this._shadowTimer = Math.floor(this.clock.elapsedTime * 2);
      const box = new THREE.Box3().setFromObject(this.content);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(12, box.getSize(new THREE.Vector3()).length() * 0.55);
        this.sunTarget.position.copy(c);
        const cam = this.sun.shadow.camera;
        cam.left = -r;
        cam.right = r;
        cam.top = r;
        cam.bottom = -r;
        cam.far = r * 6 + 60;
        cam.updateProjectionMatrix();
        this.sun.position.copy(c).addScaledVector(new THREE.Vector3(...(TIME_PRESETS[this.timePreset] || TIME_PRESETS.golden).sunPos).normalize().multiplyScalar(r * 2.2 + 30));
      }
    }
    this.fpsAccum += dt;
    this.frames++;
    if (this.fpsAccum > 0.5) {
      this.fps = Math.round(this.frames / this.fpsAccum);
      this.frames = 0;
      this.fpsAccum = 0;
      this.onFps?.(this.fps);
    }
    if (this.needsRender || moving) {
      this.needsRender = false;
      if (this.bloomEnabled) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    }
  };

  screenshot(name = 'building') {
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.png`;
    a.click();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this._resizeObs?.disconnect();
    this.setBuildingLights([]);
    this.controls.dispose();
    this.renderer.dispose();
  }
}

export default Viewer;
