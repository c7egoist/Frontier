// three.js viewport: network chunks as meshes, paving textures, orbit camera, transform gizmo for
// the selected junction / control point / area vertex, and click picking by owner id.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { tileFor, TILE } from './paving.js';

const MATS = {
  asphalt: { color: 0x2c2d30, rough: 0.92 },
  gutter: { color: 0x4b4c50, rough: 0.8 },
  kerb: { color: 0xa3a39e, rough: 0.8 },
  verge: { color: 0x4d6a3a, rough: 1 },
  embank: { color: 0x5c6d45, rough: 1 },
  deck: { color: 0x6f7074, rough: 0.7 },
  pier: { color: 0x7d7e80, rough: 0.9 },
  white: { color: 0xf3f3ef, rough: 0.6, offset: true },
  guard: { color: 0xc3c8d0, rough: 0.35, metal: 0.7 },
  post: { color: 0x5b5d63, rough: 0.5, metal: 0.4 },
  grate: { color: 0x17181a, rough: 0.6 },
  pipe: { color: 0x4f5a6e, rough: 0.5, opacity: 0.55 },
};

export class Scene3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141517);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 5000);
    this.camera.position.set(-150, 130, 190);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x2a2c2a, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(140, 220, 90);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x1f2320, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    this.scene.add(ground);
    this.grid = new THREE.GridHelper(1200, 120, 0x3a3d40, 0x262829);
    this.grid.position.y = -0.03;
    this.scene.add(this.grid);

    this.netGroup = new THREE.Group();
    this.scene.add(this.netGroup);
    this.matCache = new Map();
    this.meshes = [];

    this.tc = new TransformControls(this.camera, this.renderer.domElement);
    this.tc.setSpace('world');
    this.tc.setMode('translate');
    this.scene.add(this.tc.getHelper());
    this.proxy = new THREE.Object3D();
    this.scene.add(this.proxy);
    this.tc.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (this.onDragState) this.onDragState(!!e.value);
    });
    this.tc.addEventListener('objectChange', () => {
      if (this.onGizmoMove) this.onGizmoMove(this.proxy.position.clone());
    });
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.resize();
    this._loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(this._loop);
    };
    this._loop();
  }

  material(key) {
    if (this.matCache.has(key)) return this.matCache.get(key);
    let m;
    if (key.startsWith('paving:')) {
      const [, pattern, colour] = key.split(':');
      const tex = new THREE.CanvasTexture(tileFor(pattern, colour));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
    } else {
      const spec = MATS[key] || { color: 0x888888, rough: 0.9 };
      m = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: spec.rough ?? 0.9,
        metalness: spec.metal ?? 0,
        side: THREE.DoubleSide,
        transparent: !!spec.opacity,
        opacity: spec.opacity ?? 1,
        depthWrite: !spec.opacity,
        polygonOffset: !!spec.offset,
        polygonOffsetFactor: spec.offset ? -2 : 0,
        polygonOffsetUnits: spec.offset ? -2 : 0,
      });
    }
    this.matCache.set(key, m);
    return m;
  }

  /** replace the network meshes */
  setChunks(chunks) {
    for (const m of this.meshes) {
      m.geometry.dispose();
      this.netGroup.remove(m);
    }
    this.meshes = [];
    for (const c of chunks) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
      geo.computeVertexNormals();
      const uv = new Float32Array((c.positions.length / 3) * 2);
      for (let i = 0, j = 0; i < c.positions.length; i += 3, j += 2) {
        uv[j] = c.positions[i] / TILE;
        uv[j + 1] = c.positions[i + 2] / TILE;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(geo, this.material(c.mat));
      mesh.userData = { owner: c.owner, mat: c.mat };
      mesh.renderOrder = c.mat === 'white' ? 2 : 0;
      this.netGroup.add(mesh);
      this.meshes.push(mesh);
    }
  }

  /** attach the gizmo to a world position; onMove(Vector3) fires while dragging */
  setGizmo(pos, onMove, onDragState) {
    if (!pos) {
      this.tc.detach();
      return;
    }
    this.proxy.position.set(pos.x, pos.y, pos.z);
    if (this.tc.object !== this.proxy) this.tc.attach(this.proxy);
    this.onGizmoMove = onMove;
    this.onDragState = onDragState;
  }

  clearGizmo() {
    this.tc.detach();
    this.onGizmoMove = null;
  }

  setShowGrid(on) {
    this.grid.visible = on;
  }

  /** owner id under the pointer, or null */
  pickAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    const hit = hits.find((h) => h.object.userData.owner);
    return hit ? hit.object.userData.owner : null;
  }

  resize() {
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.tc.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
