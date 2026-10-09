// 3D perspective view (three.js). Owns the GPU objects for the built network,
// the pick proxies, the handles and the translate gizmo. It never edits the
// model directly: it reports drags and picks to the app through callbacks.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { MATERIALS } from '../model/materials.js';
import { patternCanvas } from './textures.js';
import { makeTerrain } from '../geom/terrain.js';

const SKY = '#161a20';

export class SceneView {
  constructor(container, hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 900, 3200);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 6000);
    this.camera.position.set(260, 220, 260);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    const hemi = new THREE.HemisphereLight('#d9e2ee', '#3a3830', 1.05);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff6e6', 1.7);
    sun.position.set(220, 360, 140);
    this.scene.add(sun);

    this.groups = new THREE.Group();
    this.handles = new THREE.Group();
    this.pickers = new THREE.Group();
    this.overlay = new THREE.Group();
    this.scene.add(this.groups, this.handles, this.pickers, this.overlay);
    this.terrainMesh = null;
    this.referenceMesh = null;
    this.materials = new Map();
    this.nodeHandles = new Map();
    this.pointHandles = [];
    this.selected = null;

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setMode('translate');
    this.gizmo.setSize(0.8);
    this.gizmoProxy = new THREE.Object3D();
    this.scene.add(this.gizmoProxy);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (this.hooks.onDragging) this.hooks.onDragging(!!e.value);
    });
    this.gizmo.addEventListener('objectChange', () => {
      const t = this.gizmoProxy;
      if (this.selected && this.hooks.onGizmoMove) this.hooks.onGizmoMove(this.selected, { x: t.position.x, y: t.position.y, z: t.position.z });
    });
    this.scene.add(this.gizmo.getHelper ? this.gizmo.getHelper() : this.gizmo);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dom = this.renderer.domElement;
    this._down = null;
    this.dom.addEventListener('pointerdown', (e) => (this._down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    this.dom.addEventListener('pointerup', (e) => this._onUp(e));

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this._raf = requestAnimationFrame(this._loop);
  }

  _loop = () => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._loop);
  };

  resize() {
    const w = Math.max(10, this.container.clientWidth);
    const h = Math.max(10, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  material(key) {
    if (this.materials.has(key)) return this.materials.get(key);
    const m = MATERIALS[key] || MATERIALS.asphalt;
    const params = {
      color: new THREE.Color(m.color),
      roughness: m.roughness ?? 0.9,
      metalness: m.metalness ?? 0,
      side: THREE.FrontSide,
    };
    if (m.decal) {
      params.polygonOffset = true;
      params.polygonOffsetFactor = -2;
      params.polygonOffsetUnits = -2;
    }
    if (m.texture && patternCanvas(m.texture)) {
      const tex = new THREE.CanvasTexture(patternCanvas(m.texture));
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / m.tile, 1 / m.tile);
      tex.anisotropy = 4;
      params.map = tex;
      params.color = new THREE.Color('#ffffff');
    }
    const mat = new THREE.MeshStandardMaterial(params);
    this.materials.set(key, mat);
    return mat;
  }

  // Replace the network meshes and pick proxies. With handles:false only the
  // geometry and pickers change (used while a handle is being dragged).
  setNetwork(net, project, selection = null, opts = { handles: true }) {
    this._clear(this.groups);
    for (const [key, g] of net.mesh.groups) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
      geo.setIndex(new THREE.BufferAttribute(g.index, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material(key));
      mesh.name = key;
      mesh.renderOrder = MATERIALS[key]?.decal ? 2 : 0;
      this.groups.add(mesh);
    }
    if (opts.handles !== false || !this.terrainMesh) this._buildTerrain(net, project);
    this._buildPickers(net);
    if (opts.handles !== false) this._buildHandles(net, project, selection);
    else if (project) this.syncHandles(project);
  }

  // Keep node handle positions in step with the model without rebuilding them.
  // The gizmo proxy follows the model too, unless the gizmo itself is being dragged.
  syncHandles(project) {
    for (const n of project.nodes) {
      const m = this.nodeHandles.get(n.id);
      if (m) m.position.set(n.x, n.y + 0.4, n.z);
    }
    if (this.gizmo.dragging || !this.selected) return;
    if (this.selected.type === 'node') {
      const n = project.nodes.find((x) => x.id === this.selected.id);
      if (n) this.gizmoProxy.position.set(n.x, n.y + 0.4, n.z);
    } else if (this.selected.type === 'point') {
      const r = project.roads.find((x) => x.id === this.selected.id);
      const p = r && r.points[this.selected.index];
      if (p) this.gizmoProxy.position.set(p.x, p.y + 0.4, p.z);
    }
  }

  _clear(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
  }

  _buildTerrain(net, project) {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.material.dispose();
      this.terrainMesh = null;
    }
    const pts = [];
    for (const n of project.nodes) pts.push([n.x, n.z]);
    for (const r of project.roads) for (const p of r.points) pts.push([p.x, p.z]);
    let minX = -200;
    let maxX = 200;
    let minZ = -200;
    let maxZ = 200;
    if (pts.length) {
      minX = Math.min(...pts.map((p) => p[0])) - 220;
      maxX = Math.max(...pts.map((p) => p[0])) + 220;
      minZ = Math.min(...pts.map((p) => p[1])) - 220;
      maxZ = Math.max(...pts.map((p) => p[1])) + 220;
    }
    const cell = 6;
    const nx = Math.ceil((maxX - minX) / cell);
    const nz = Math.ceil((maxZ - minZ) / cell);
    const terrain = net.terrain ?? makeTerrain(project.terrain);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    let k = 0;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = minX + i * cell;
        const z = minZ + j * cell;
        pos[k++] = x;
        pos[k++] = terrain.height(x, z);
        pos[k++] = z;
      }
    }
    const idx = new Uint32Array(nx * nz * 6);
    let q = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        idx.set([a, c, b, b, c, d], q);
        q += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4d5d37'), roughness: 1, metalness: 0 });
    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.name = 'terrain';
    this.scene.add(this.terrainMesh);
  }

  _buildPickers(net) {
    this._clear(this.pickers);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    for (const r of net.roads) {
      const pts = [];
      const n = Math.max(2, Math.ceil(r.cl.L / 6));
      for (let i = 0; i <= n; i++) {
        const p = r.cl.at((r.cl.L * i) / n).p;
        pts.push(new THREE.Vector3(p[0], p[1] + 0.5, p[2]));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), 3.2, 6, false), mat);
      tube.userData = { kind: 'road', id: r.id };
      this.pickers.add(tube);
    }
  }

  _buildHandles(net, project, selection) {
    this._clear(this.handles);
    this.nodeHandles = new Map();
    this.pointHandles = [];
    const nodeMat = new THREE.MeshStandardMaterial({ color: '#2fb8a6', roughness: 0.5, emissive: '#06302a' });
    const nodeSel = new THREE.MeshStandardMaterial({ color: '#f5b341', roughness: 0.4, emissive: '#3a2600' });
    const geo = new THREE.SphereGeometry(1.8, 16, 12);
    for (const n of project.nodes) {
      const isSel = selection && selection.type === 'node' && selection.id === n.id;
      const m = new THREE.Mesh(geo, isSel ? nodeSel : nodeMat);
      m.position.set(n.x, n.y + 0.4, n.z);
      m.userData = { kind: 'node', id: n.id };
      this.handles.add(m);
      this.nodeHandles.set(n.id, m);
    }
    if (selection && selection.type === 'road') {
      const r = project.roads.find((x) => x.id === selection.id);
      if (r) {
        const pm = new THREE.MeshStandardMaterial({ color: '#f5b341', roughness: 0.5 });
        const pg = new THREE.SphereGeometry(1.3, 12, 10);
        r.points.forEach((p, i) => {
          const m = new THREE.Mesh(pg, pm);
          m.position.set(p.x, p.y + 0.4, p.z);
          m.userData = { kind: 'point', id: r.id, index: i };
          this.handles.add(m);
          this.pointHandles.push(m);
        });
      }
    }
    if (selection && selection.type === 'road' && net) {
      // mark the selected road's centreline with a light strip
      const r = net.roads.find((x) => x.id === selection.id);
      if (r) {
        const pts = [];
        const n = Math.max(2, Math.ceil(r.cl.L / 3));
        for (let i = 0; i <= n; i++) {
          const p = r.cl.at((r.cl.L * i) / n).p;
          pts.push(new THREE.Vector3(p[0], p[1] + 0.6, p[2]));
        }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#f5b341' }));
        this.handles.add(line);
      }
    }
    this.attachGizmo(selection);
  }

  // Update just the handle positions and selection (cheap; used during drags).
  setSelection(selection, project) {
    this.selected = selection;
    this.attachGizmo(selection);
    if (project) this.syncHandles(project);
  }

  attachGizmo(selection) {
    this.selected = selection;
    if (!selection) {
      this.gizmo.detach();
      return;
    }
    let target = null;
    if (selection.type === 'node') target = this.nodeHandles.get(selection.id) || null;
    if (selection.type === 'point') target = this.pointHandles.find((h) => h.userData.index === selection.index) || null;
    if (!target) {
      this.gizmo.detach();
      return;
    }
    this.gizmoProxy.position.copy(target.position);
    this.gizmo.attach(this.gizmoProxy);
  }

  setReference(data) {
    if (this.referenceMesh) {
      this.scene.remove(this.referenceMesh);
      this.referenceMesh.geometry.dispose();
      this.referenceMesh.material.dispose();
      this.referenceMesh = null;
    }
    if (!data) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#9aa8b8', roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    this.referenceMesh = new THREE.Mesh(geo, mat);
    this.referenceMesh.name = 'reference';
    this.scene.add(this.referenceMesh);
  }

  showReference(on) {
    if (this.referenceMesh) this.referenceMesh.visible = !!on;
  }

  // Fit the bounding sphere of the bounds into the view, respecting the aspect ratio.
  frame(bounds) {
    const b = bounds || { min: [-200, 0, -200], max: [200, 20, 200] };
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const radius = Math.max(60, 0.5 * Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]));
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fov = Math.min(vfov, hfov);
    const dist = (radius / Math.sin(fov / 2)) * 0.86;
    const dir = [0.72, 0.6, 0.72];
    const dl = Math.hypot(...dir);
    this.controls.target.set(cx, cy, cz);
    this.camera.position.set(cx + (dir[0] / dl) * dist, cy + (dir[1] / dl) * dist, cz + (dir[2] / dl) * dist);
    this.camera.near = Math.max(0.5, dist / 500);
    this.camera.far = Math.max(6000, dist * 6);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  // Pointer up without a drag = pick.
  _onUp(e) {
    const d = this._down;
    this._down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || this.gizmo.dragging) return;
    const rect = this.dom.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const handleHits = this.raycaster.intersectObjects([...this.handles.children, ...this.pointHandles], false);
    const hit = handleHits.find((h) => h.object.userData && h.object.userData.kind);
    if (hit) {
      if (this.hooks.onPick) this.hooks.onPick(hit.object.userData);
      return;
    }
    const roadHits = this.raycaster.intersectObjects(this.pickers.children, false);
    if (roadHits.length && this.hooks.onPick) {
      const u = roadHits[0].object.userData;
      this.hooks.onPick({ kind: 'road', id: u.id, point: roadHits[0].point });
      return;
    }
    if (this.hooks.onPick) this.hooks.onPick(null);
  }

  // Ground point under the pointer (for placing nodes in 3D).
  groundAt(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.terrainMesh, false);
    return hits.length ? hits[0].point : null;
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.gizmo.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
