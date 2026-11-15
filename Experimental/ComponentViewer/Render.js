// three.js layer shared by Geometry Compile and the Component Viewer: viewport stage, render geometry built from a
// compiled asset (full detail, LOD level or UV checker), material slots, collision gizmos and the offscreen icon baker.
import * as THREE from './Vendor/three.esm.min.js';
import { OrbitControls } from './Vendor/orbit-controls.esm.min.js';

export { THREE };

// CourseMaterial families used by the ControlVehicle (Frontier-OLD · VehicleProvingGrounds/Source/MaterialSpecification.js).
// Albedo is linear; emission is clamped for display.
export const VEHICLE_PALETTE = {
  6: { name: 'BodyCoat', albedo: [0.68, 0.8, 0.0], roughness: 0.2, metalness: 0 },
  7: { name: 'VehicleGlass', albedo: [0.026, 0.028, 0.03], roughness: 0.05, metalness: 0 },
  8: { name: 'VehiclePlastic', albedo: [0.012, 0.014, 0.018], roughness: 0.5, metalness: 0 },
  9: { name: 'Tyre', albedo: [0.037, 0.037, 0.037], roughness: 0.76, metalness: 0 },
  10: { name: 'Hub', albedo: [0.06, 0.22, 0.62], roughness: 0.22, metalness: 1, emission: [0, 0.033, 0.12] },
  11: { name: 'Brake', albedo: [0.3, 0.075, 0.025], roughness: 0.29, metalness: 0.82 },
  12: { name: 'VehicleTrim', albedo: [0.8, 0.8, 0.8], roughness: 0.5, metalness: 0 },
  13: { name: 'Headlight', albedo: [0.8, 0.8, 0.8], roughness: 0.1, metalness: 0, emission: [1, 1, 1] },
  14: { name: 'Taillight', albedo: [0.8, 0.8, 0.8], roughness: 0.1, metalness: 0, emission: [1, 0, 0.016] },
  15: { name: 'VehicleDefault', albedo: [0.8, 0.8, 0.8], roughness: 0.5, metalness: 0 },
};

const CLAY = '#c3c7cf';

// Material slots of an asset: one per family present in its triangles.
export function assetSlots(asset) {
  const g = asset.out.geometry || asset.out.source;
  const fams = g && g.families ? [...new Set(g.families)].sort((a, b) => a - b) : [0];
  return fams.map((family, i) => {
    const spec = asset.palette && asset.palette[family];
    if (spec) {
      const c = new THREE.Color().setRGB(...spec.albedo, THREE.LinearSRGBColorSpace);
      const e = spec.emission ? new THREE.Color().setRGB(...spec.emission, THREE.LinearSRGBColorSpace) : null;
      return { family, name: spec.name, color: '#' + c.getHexString(), roughness: spec.roughness, metalness: spec.metalness, emissive: e ? '#' + e.getHexString() : null };
    }
    const name = asset.slotNames ? asset.slotNames[family] || `Slot ${family}` : fams.length > 1 ? `Slot ${family}` : 'Default';
    const color = fams.length > 1 ? '#' + new THREE.Color().setHSL(((i * 0.161) + 0.08) % 1, 0.35, 0.62).getHexString() : CLAY;
    return { family, name, color, roughness: 0.55, metalness: 0, emissive: null };
  });
}

// ------------------------------------------------------------------------------------------------- render geometry
const geometryCache = new Map();

function cached(key, make) {
  if (geometryCache.has(key)) return geometryCache.get(key);
  const g = make();
  geometryCache.set(key, g);
  if (geometryCache.size > 80) {
    const first = geometryCache.keys().next().value;
    geometryCache.get(first).dispose();
    geometryCache.delete(first);
  }
  return g;
}

// Full-detail, non-indexed geometry with per-corner normals, UVs (when baked) and one group per material slot.
export function renderGeometry(asset) {
  const g = asset.out.geometry;
  if (!g) return null;
  return cached(`${asset.id}:${asset.revision}:full`, () => {
    const tris = g.indices.length / 3;
    const order = new Uint32Array(tris);
    for (let t = 0; t < tris; t++) order[t] = t;
    const fam = g.families;
    if (fam) order.sort((a, b) => fam[a] - fam[b] || a - b);
    const pos = new Float32Array(tris * 9), nor = new Float32Array(tris * 9);
    const uvSrc = asset.out.uv ? asset.out.uv.uvs : null;
    const uv = uvSrc ? new Float32Array(tris * 6) : null;
    const geo = new THREE.BufferGeometry();
    const slots = assetSlots(asset).map((s) => s.family);
    let groupStart = 0, current = fam ? fam[order[0]] : 0;
    for (let i = 0; i < tris; i++) {
      const t = order[i];
      const f = fam ? fam[t] : 0;
      if (f !== current) { geo.addGroup(groupStart * 3, (i - groupStart) * 3, slots.indexOf(current)); groupStart = i; current = f; }
      for (let k = 0; k < 3; k++) {
        const v = g.indices[t * 3 + k] * 3;
        pos.set([g.positions[v], g.positions[v + 1], g.positions[v + 2]], i * 9 + k * 3);
        nor.set(g.normals.subarray(t * 9 + k * 3, t * 9 + k * 3 + 3), i * 9 + k * 3);
        if (uv) { uv[i * 6 + k * 2] = uvSrc[(t * 3 + k) * 2]; uv[i * 6 + k * 2 + 1] = uvSrc[(t * 3 + k) * 2 + 1]; }
      }
    }
    geo.addGroup(groupStart * 3, (tris - groupStart) * 3, slots.indexOf(current));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  });
}

// One level of the cluster hierarchy, coloured per cluster (the corner stream is the real simplified level).
export function lodGeometry(asset, level) {
  const h = asset.out.lod, g = asset.out.geometry;
  if (!h || !g) return null;
  const L = Math.max(0, Math.min(h.levels.length - 1, level));
  return cached(`${asset.id}:${asset.revision}:lod${L}`, () => {
    let corners = 0;
    for (let c = 0; c < h.clusterLevel.length; c++) if (h.clusterLevel[c] === L) corners += h.clusterSize[c];
    const pos = new Float32Array(corners * 3), nor = new Float32Array(corners * 3), col = new Float32Array(corners * 3);
    const tmp = new THREE.Color();
    let o = 0;
    for (let c = 0; c < h.clusterLevel.length; c++) {
      if (h.clusterLevel[c] !== L) continue;
      tmp.setHSL(((c * 137.508) % 360) / 360, 0.55, 0.58);
      const first = h.clusterFirst[c], size = h.clusterSize[c];
      for (let i = 0; i < size; i += 3) {
        const a = h.cornerVertex[first + i] * 3, b = h.cornerVertex[first + i + 1] * 3, d = h.cornerVertex[first + i + 2] * 3;
        const p = g.positions;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        for (const v of [a, b, d]) {
          pos[o] = p[v]; pos[o + 1] = p[v + 1]; pos[o + 2] = p[v + 2];
          nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
          col[o] = tmp.r; col[o + 1] = tmp.g; col[o + 2] = tmp.b;
          o += 3;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    geo.userData = { level: L, triangles: corners / 3 };
    return geo;
  });
}

// One level of the cluster hierarchy drawn with its materials: each surviving triangle keeps its source family, so the
// level gets one group per material slot exactly like the full-detail mesh. Flat normals (positions are shared, the
// triangles around them changed).
export function lodMaterialGeometry(asset, level) {
  const h = asset.out.lod, g = asset.out.geometry;
  if (!h || !g) return null;
  const L = Math.max(0, Math.min(h.levels.length - 1, level));
  return cached(`${asset.id}:${asset.revision}:lodmat${L}`, () => {
    const tris = [];
    for (let c = 0; c < h.clusterLevel.length; c++) {
      if (h.clusterLevel[c] !== L) continue;
      for (let i = h.clusterFirst[c] / 3, end = i + h.clusterSize[c] / 3; i < end; i++) tris.push(i);
    }
    const fam = h.triangleFamily || null;
    if (fam) tris.sort((a, b) => fam[a] - fam[b] || a - b);
    const slots = assetSlots(asset).map((s) => s.family);
    const pos = new Float32Array(tris.length * 9), nor = new Float32Array(tris.length * 9);
    const geo = new THREE.BufferGeometry();
    const p = g.positions;
    let groupStart = 0, current = fam && tris.length ? fam[tris[0]] : slots[0];
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const f = fam ? fam[t] : slots[0];
      if (f !== current) { geo.addGroup(groupStart * 3, (i - groupStart) * 3, Math.max(0, slots.indexOf(current))); groupStart = i; current = f; }
      const a = h.cornerVertex[t * 3] * 3, b = h.cornerVertex[t * 3 + 1] * 3, d = h.cornerVertex[t * 3 + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      [a, b, d].forEach((v, k) => {
        const o = i * 9 + k * 3;
        pos[o] = p[v]; pos[o + 1] = p[v + 1]; pos[o + 2] = p[v + 2];
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
      });
    }
    geo.addGroup(groupStart * 3, (tris.length - groupStart) * 3, Math.max(0, slots.indexOf(current)));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    geo.userData = { level: L, triangles: tris.length };
    return geo;
  });
}

let checker = null;
export function checkerTexture() {
  if (checker) return checker;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const n = 8, s = 512 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillStyle = (i + j) % 2 ? '#2b2f38' : `hsl(${(i * 28 + j * 9) % 360} 45% 62%)`;
    g.fillRect(i * s, j * s, s, s);
  }
  g.fillStyle = '#0b0b0d';
  g.font = '500 20px DM Sans, sans-serif';
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.fillText(`${String.fromCharCode(65 + i)}${n - j}`, i * s + 8, j * s + 26);
  checker = new THREE.CanvasTexture(c);
  checker.colorSpace = THREE.SRGBColorSpace;
  checker.anisotropy = 4;
  return checker;
}

// Materials for one mesh in a given view channel. overrides: { [family]: '#hex' } colour overrides from the component.
export function channelMaterials(asset, channel, overrides = {}) {
  const slots = assetSlots(asset);
  if (channel === 'normals') return slots.map(() => new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }));
  if (channel === 'uv') {
    const has = !!asset.out.uv;
    return slots.map(() => has ? new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.7, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: '#7a2d5a', roughness: 0.8, side: THREE.DoubleSide }));
  }
  return slots.map((s) => {
    const color = overrides[s.family] || s.color;
    if (channel === 'unlit') return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const m = new THREE.MeshStandardMaterial({ color, roughness: s.roughness, metalness: s.metalness, side: THREE.DoubleSide });
    if (s.emissive) { m.emissive = new THREE.Color(s.emissive); m.emissiveIntensity = 1.4; }
    if (channel === 'collision') { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; }
    return m;
  });
}

// Mesh object for an asset in a channel. Returns a Group; userData.mesh is the pickable mesh.
export function meshObject(asset, { channel = 'lit', lod = -1, overrides = {}, castShadow = true } = {}) {
  const group = new THREE.Group();
  if (!asset || !asset.out.geometry) return group;
  let mesh;
  const useLod = (channel === 'lod' && asset.out.lod) || (lod >= 0 && asset.out.lod);
  if (useLod) {
    const level = channel === 'lod' && lod < 0 ? 0 : lod;
    if (channel === 'lod') mesh = new THREE.Mesh(lodGeometry(asset, level), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, flatShading: true }));
    else mesh = new THREE.Mesh(lodMaterialGeometry(asset, level), channelMaterials(asset, channel, overrides));
  } else {
    mesh = new THREE.Mesh(renderGeometry(asset), channelMaterials(asset, channel, overrides));
  }
  mesh.castShadow = castShadow && channel !== 'collision';
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.mesh = mesh;
  if (channel === 'wire') {
    const wire = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: '#7fb4ff', wireframe: true, transparent: true, opacity: 0.28, depthTest: true }));
    wire.raycast = () => {};
    group.add(wire);
  }
  if (channel === 'collision' && asset.out.collision) group.add(collisionObject(asset.out.collision));
  return group;
}

const COLLISION_GREEN = '#46d267';

export function collisionObject(shape, color = COLLISION_GREEN) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  if (!shape || shape.type === 'none') return group;
  let lines;
  if (shape.type === 'box' || shape.type === 'sdf') {
    lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(shape.half[0] * 2, shape.half[1] * 2, shape.half[2] * 2)), shape.type === 'sdf' ? new THREE.LineDashedMaterial({ color: '#6aa7c7', dashSize: 0.06, gapSize: 0.04 }) : mat);
    if (shape.type === 'sdf') lines.computeLineDistances();
  } else if (shape.type === 'sphere') {
    lines = new THREE.Group();
    const circle = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => { const a = (i / 64) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * shape.radius, Math.sin(a) * shape.radius, 0); }));
    for (const r of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) { const l = new THREE.Line(circle, mat); l.rotation.set(...r); lines.add(l); }
  } else if (shape.type === 'capsule') {
    lines = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.CapsuleGeometry(shape.radius, shape.halfHeight * 2, 3, 12)), mat);
    if (shape.axis === 0) lines.rotation.z = Math.PI / 2;
    if (shape.axis === 2) lines.rotation.x = Math.PI / 2;
  }
  if (lines) { lines.position.set(...shape.centre); group.add(lines); }
  group.traverse((o) => { o.raycast = () => {}; });
  return group;
}

// --------------------------------------------------------------------------------------------------------- stage
export class Stage {
  constructor(canvas, { background = '#0b0b0d', grid = true, shadows = true } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 500);
    this.camera.position.set(4, 2.6, 5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#202024', 1.5));
    this.sun = new THREE.DirectionalLight('#ffffff', 2.4);
    this.sun.position.set(5, 9, 4);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight('#9fc4ff', 0.6);
    fill.position.set(-6, 3, -5);
    this.scene.add(fill);
    this.grid = new THREE.GridHelper(40, 80, '#3a3a40', '#1f1f24');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.8;
    this.grid.visible = grid;
    this.scene.add(this.grid);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.35 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.raycast = () => {};
    this.scene.add(this.ground);
    this.content = new THREE.Group();
    this.overlay = new THREE.Group();
    this.scene.add(this.content, this.overlay);
    this.frameCallbacks = new Set();
    this.raycaster = new THREE.Raycaster();
    this.lastTime = performance.now();
    this.stats = { fps: 0, ms: 0 };
    let frames = 0, last = performance.now();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      if (!canvas.offsetParent) return;
      const t0 = performance.now();
      const dt = Math.min(0.05, (t0 - this.lastTime) / 1000);
      this.lastTime = t0;
      this.controls.update();
      for (const cb of this.frameCallbacks) cb(dt);
      this.renderer.render(this.scene, this.camera);
      frames++;
      const now = performance.now();
      this.stats.ms = now - t0;
      if (now - last > 500) { this.stats.fps = (frames * 1000) / (now - last); frames = 0; last = now; }
    });
  }

  resize() {
    const host = this.canvas.parentElement;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setContent(object) {
    for (const c of [...this.content.children]) { this.content.remove(c); disposeMaterials(c); }
    if (object) this.content.add(object);
  }

  setOverlay(object) {
    for (const c of [...this.overlay.children]) this.overlay.remove(c);
    if (object) this.overlay.add(object);
  }

  // Fits the camera to a box (THREE.Box3) at the given view angle.
  frame(box, { yaw = 38, pitch = 22, keepAngle = false } = {}) {
    if (!box || box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.05);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.12;
    let dir;
    if (keepAngle) dir = this.camera.position.clone().sub(this.controls.target).normalize();
    else {
      const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch);
      dir = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
    }
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.005, dist / 200);
    this.camera.far = dist * 50 + 50;
    this.camera.updateProjectionMatrix();
    this.sun.position.copy(sphere.center).add(new THREE.Vector3(r * 2.5 + 2, r * 4 + 4, r * 2 + 2));
    this.sun.target.position.copy(sphere.center);
    const cam = this.sun.shadow.camera;
    const s = r * 1.8 + 0.5;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 0.1; cam.far = r * 12 + 20;
    cam.updateProjectionMatrix();
  }

  pick(clientX, clientY, roots = [this.content]) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.componentId) o = o.parent;
      if (o && o.visible !== false) return { componentId: o.userData.componentId, point: hit.point, object: hit.object };
    }
    return null;
  }
}

function disposeMaterials(object) {
  object.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}

// ---------------------------------------------------------------------------------------------------- icon baker
export class IconRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#eef2ff', '#2a2a30', 1.7));
    const key = new THREE.DirectionalLight('#ffffff', 2.6);
    key.position.set(4, 7, 5);
    const rim = new THREE.DirectionalLight('#9fc4ff', 1.2);
    rim.position.set(-5, 3, -6);
    this.scene.add(key, rim);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.01, 500);
  }

  // object: THREE.Object3D in its final pose. Returns a PNG data URL.
  render(object, { size = 256, yaw = 35, pitch = 22, background = 'transparent' } = {}) {
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.scene.add(object);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.04;
    const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch);
    this.camera.position.copy(sphere.center).add(new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(dist));
    this.camera.near = dist / 100; this.camera.far = dist * 10;
    this.camera.lookAt(sphere.center);
    this.camera.updateProjectionMatrix();
    if (background === 'transparent') { this.scene.background = null; this.renderer.setClearColor(0x000000, 0); }
    else { this.scene.background = new THREE.Color(background === 'studio' ? '#1c232c' : '#141414'); }
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    this.scene.remove(object);
    return url;
  }
}

export function boxOf(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}
