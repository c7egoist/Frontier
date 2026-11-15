// 3D fracture viewport: the object's pieces as real solids (outer skin in the object's material, fresh crack faces
// lighter and rougher), an amber impact point you place on the surface, explode / cutaway / drop-test previews and a
// hover halo per piece.  Built on the Component Viewer's glide camera and line-free visuals (dot floor, glow sprite,
// in-material halo) — no wireframes, no outline helpers, no selection footprint.
import * as THREE from '../Shared/Studio/Vendor/three.esm.min.js';
import { CameraRig } from '../Shared/Studio/Camera.js';
import { dotFloor, glowSprite, haloCompile, clock } from '../Shared/Studio/Visuals.js';

const RAMP = ['#306bf2', '#29c7c2', '#59d15c', '#f7cc40', '#f04d3d'].map((c) => new THREE.Color(c));
const ramp = (t, out = new THREE.Color()) => { t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1); const i = Math.min(RAMP.length - 2, Math.floor(t)); return out.copy(RAMP[i]).lerp(RAMP[i + 1], t - i); };
const AMBER = new THREE.Color('#ffb238');
const SURFACE = {
  concrete: { roughness: 0.92, metalness: 0, cut: 0.22 },
  rock: { roughness: 0.85, metalness: 0, cut: 0.18 },
  wood: { roughness: 0.72, metalness: 0, cut: 0.3 },
  glass: { roughness: 0.04, metalness: 0.1, cut: 0.45, opacity: 0.42, cutOpacity: 0.75 },
  tempered: { roughness: 0.06, metalness: 0.1, cut: 0.4, opacity: 0.5, cutOpacity: 0.8 },
  plastic: { roughness: 0.45, metalness: 0, cut: 0.12 },
};

function pieceGeometry(cell) {
  const pos = [], groups = [[], []];
  const [cx, cy, cz] = cell.centroid;
  for (const f of cell.faces) {
    const g = f.kind === 'outer' ? groups[0] : groups[1];
    for (let i = 1; i + 1 < f.pts.length; i++) for (const p of [f.pts[0], f.pts[i], f.pts[i + 1]]) g.push(p[0] - cx, p[1] - cy, p[2] - cz);
  }
  pos.push(...groups[0], ...groups[1]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals(); // non-indexed → flat facets
  geo.addGroup(0, groups[0].length / 3, 0);
  geo.addGroup(groups[0].length / 3, groups[1].length / 3, 1);
  geo.computeBoundingSphere();
  return geo;
}

function haloOf(material) {
  const m = material.clone();
  m.onBeforeCompile = haloCompile;
  m.customProgramCacheKey = () => `halo:${material.type}`;
  return m;
}

export class FractureViewport {
  constructor(canvas, { onImpact = () => {}, onHover = () => {} } = {}) {
    this.canvas = canvas;
    this.onImpact = onImpact;
    this.onHover = onHover;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0d0f');
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 500);
    this.raycaster = new THREE.Raycaster();
    this.rig = new CameraRig(this.camera, canvas, { pick: (x, y) => this.hitAt(x, y)?.point ?? null });
    scene.add(new THREE.HemisphereLight('#dfe8ff', '#1c1c20', 1.4));
    const sun = this.sun = new THREE.DirectionalLight('#ffffff', 2.6);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight('#9fc4ff', 0.8);
    rim.position.set(-6, 3, -5);
    scene.add(rim);
    this.floor = dotFloor();
    scene.add(this.floor);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.raycast = () => {};
    scene.add(ground);
    this.root = new THREE.Group();
    scene.add(this.root);
    // Impact: a glow (size follows energy) and a small core, drawn over everything so it reads inside the solid too.
    this.impact = new THREE.Group();
    this.impactGlow = glowSprite(AMBER, 1, 0.75);
    this.impactCore = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: AMBER, depthTest: false, transparent: true }));
    this.impactCore.renderOrder = 8; this.impactGlow.material.depthTest = false;
    this.impactCore.raycast = () => {};
    this.impact.add(this.impactGlow, this.impactCore);
    this.root.add(this.impact);

    this.pieces = [];
    this.result = null;
    this.shade = 'material';
    this.explode = 0;
    this.cutaway = false;
    this.sim = null;
    this.hovered = -1;
    this.aim = true;
    this.lastFrame = performance.now();
    this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ content
  setResult(result, settings, { reframe = false, fractured = true } = {}) {
    const keepHover = this.hovered;
    this.clearPieces();
    this.result = result;
    this.settings = settings;
    this.fractured = fractured;
    const [, sy] = result.owner.Scale;
    this.root.position.y = sy / 2;
    this.R = Math.hypot(...result.owner.Scale) / 2;
    for (const [i, cell] of result.cells.entries()) {
      const mesh = new THREE.Mesh(pieceGeometry(cell), [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })]);
      mesh.position.fromArray(cell.centroid);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { index: i, home: new THREE.Vector3().fromArray(cell.centroid), cell };
      this.root.add(mesh);
      this.pieces.push(mesh);
    }
    this.paint();
    this.placeImpact();
    this.applyLayout();
    if (this.sim) this.startSim(this.sim.paused);
    if (keepHover >= 0 && keepHover < this.pieces.length) this.setHover(keepHover, true); else this.hovered = -1;
    if (reframe) this.frameObject(true);
  }

  clearPieces() {
    for (const m of this.pieces) {
      m.geometry.dispose();
      for (const mat of m.material) mat.dispose();
      for (const mat of m.userData.base || []) if (!m.material.includes(mat)) mat.dispose();
      this.root.remove(m);
    }
    this.pieces = [];
    this.hovered = -1;
  }

  paint() {
    const s = this.settings, surf = SURFACE[s.Material] || SURFACE.concrete;
    const tone = new THREE.Color(this.tone || '#a29d94');
    const n = this.pieces.length, cells = this.result.cells;
    const sizes = cells.map((c) => Math.log(c.size)), lo = Math.min(...sizes), hi = Math.max(...sizes);
    const outerC = new THREE.Color(), innerC = new THREE.Color();
    for (const [i, mesh] of this.pieces.entries()) {
      const cell = mesh.userData.cell, [outer, inner] = mesh.userData.base || mesh.material;
      let heat = 0;
      if (this.shade === 'size') { ramp(hi - lo < 1e-9 ? 0.5 : 1 - (Math.log(cell.size) - lo) / (hi - lo), outerC); innerC.copy(outerC).multiplyScalar(0.72); }
      else if (this.shade === 'release') { ramp(1 - i / Math.max(1, n - 1), outerC); innerC.copy(outerC).multiplyScalar(0.72); }
      else {
        outerC.copy(tone).multiplyScalar(this.fractured ? 0.82 + 0.3 * cell.shade : 1);
        innerC.copy(tone).lerp(new THREE.Color('#ffffff'), surf.cut).multiplyScalar(0.95);
        heat = this.fractured ? Math.max(0, 1 - cell.dist / (this.R * 0.35)) : 0;
      }
      const tinted = this.shade !== 'material';
      for (const [mat, col, isCut] of [[outer, outerC, false], [inner, innerC, true]]) {
        mat.color.copy(col);
        mat.roughness = tinted ? 0.6 : isCut ? Math.min(1, surf.roughness + 0.08) : surf.roughness;
        mat.metalness = tinted ? 0 : surf.metalness;
        mat.emissive.copy(AMBER).multiplyScalar(heat * (isCut ? 0.3 : 0.18));
        const opacity = tinted ? 1 : isCut ? surf.cutOpacity ?? 1 : surf.opacity ?? 1;
        mat.transparent = opacity < 1; mat.opacity = opacity; mat.depthWrite = true;
        mat.needsUpdate = true;
      }
      mesh.castShadow = !(surf.opacity && !tinted);
    }
    if (this.hovered >= 0) this.setHover(this.hovered, true);
  }

  setTone(tone) { this.tone = tone; }
  setShade(mode) { this.shade = mode; if (this.result) this.paint(); }
  setExplode(t) { this.explode = t; this.applyLayout(); }
  setCutaway(on) { this.cutaway = on; this.applyLayout(); }

  placeImpact() {
    const s = this.settings, imp = this.result.impact;
    this.impact.position.fromArray(imp);
    this.impact.visible = this.fractured;
    const r = this.R;
    this.impactCore.scale.setScalar(Math.max(0.008, r * 0.022));
    this.impactGlow.scale.setScalar(r * (0.22 + 0.9 * Math.sqrt(s.Energy / 50000)));
  }

  offsetFor(mesh) {
    if (!this.explode || !this.fractured) return new THREE.Vector3();
    const c = mesh.userData.home, imp = new THREE.Vector3().fromArray(this.result.impact);
    const dir = c.clone().sub(imp);
    if (dir.lengthSq() < 1e-10) dir.set(0, 1, 0);
    dir.normalize();
    const cell = mesh.userData.cell;
    return dir.multiplyScalar(this.explode * this.R * 0.45 * (0.35 + 0.65 * Math.exp(-cell.dist / this.R)));
  }

  applyLayout() {
    if (this.sim) return;
    for (const m of this.pieces) { m.position.copy(m.userData.home).add(this.offsetFor(m)); m.quaternion.identity(); }
    this.updateCutaway();
  }

  // Peel away the pieces on the camera's side of the impact, so the crack network inside is visible.
  updateCutaway() {
    if (!this.result) return;
    if (!this.cutaway || !this.fractured) { for (const m of this.pieces) m.visible = true; return; }
    const toCam = this.camera.position.clone().sub(this.root.localToWorld(new THREE.Vector3().fromArray(this.result.impact)));
    toCam.y = 0;
    if (toCam.lengthSq() < 1e-8) toCam.set(0, 0, 1);
    toCam.normalize();
    const imp = new THREE.Vector3().fromArray(this.result.impact);
    for (const m of this.pieces) m.visible = m.userData.home.clone().sub(imp).dot(toCam) < 0;
  }

  // ------------------------------------------------------------------ drop test (preview only)
  startSim(paused = false) {
    if (!this.fractured || !this.pieces.length) return;
    const s = this.settings, imp = new THREE.Vector3().fromArray(this.result.impact);
    const toughness = { plastic: 0.45, wood: 0.7, rock: 0.85 }[s.Material] ?? 1;
    let seed = s.Seed;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const floor = -this.result.owner.Scale[1] / 2;
    this.sim = { t: 0, paused, floor, bodies: this.pieces.map((m) => {
      const c = m.userData.home, dir = c.clone().sub(imp);
      if (dir.lengthSq() < 1e-10) dir.set(rand() - 0.5, 1, rand() - 0.5);
      dir.normalize();
      const speed = toughness * (0.6 + 5.5 * Math.sqrt(s.Energy / 20000)) * Math.exp(-m.userData.cell.dist / (this.R * 0.9)) * (0.6 + 0.8 * rand());
      const v = dir.multiplyScalar(speed).add(new THREE.Vector3(0, 0.6 * speed * rand(), 0));
      const w = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(speed * 6);
      return { mesh: m, p: c.clone(), v, w, q: new THREE.Quaternion(), r: m.userData.cell.radius * 0.5, rest: false };
    }) };
    for (const m of this.pieces) m.visible = true;
  }

  stopSim() { this.sim = null; this.applyLayout(); }

  stepSim(dt) {
    const sim = this.sim;
    if (!sim || sim.paused) return;
    const steps = 3, h = dt / steps, g = -9.81, dq = new THREE.Quaternion(), axis = new THREE.Vector3();
    for (let k = 0; k < steps; k++) for (const b of sim.bodies) {
      if (b.rest) continue;
      b.v.y += g * h;
      b.p.addScaledVector(b.v, h);
      const wl = b.w.length();
      if (wl > 1e-6) { dq.setFromAxisAngle(axis.copy(b.w).divideScalar(wl), wl * h); b.q.premultiply(dq); }
      if (b.p.y - b.r < sim.floor) {
        b.p.y = sim.floor + b.r;
        if (b.v.y < 0) b.v.y = -b.v.y * 0.28;
        b.v.x *= 0.72; b.v.z *= 0.72; b.w.multiplyScalar(0.6);
        if (b.v.lengthSq() < 0.004 && Math.abs(b.v.y) < 0.05) b.rest = true;
      }
    }
    sim.t += dt;
    for (const b of sim.bodies) { b.mesh.position.copy(b.p); b.mesh.quaternion.copy(b.q); }
  }

  // ------------------------------------------------------------------ picking
  ndc(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / (r.width || 1)) * 2 - 1, -((y - r.top) / (r.height || 1)) * 2 + 1);
  }

  hitAt(x, y) {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(this.pieces.filter((m) => m.visible), false);
    return hits[0] || null;
  }

  // Surface point back in the object's assembled (local) space, undoing explode offsets.
  localHit(hit) {
    const mesh = hit.object;
    const local = mesh.worldToLocal(hit.point.clone());           // piece space (centred on its centroid)
    if (this.sim) return null;
    return local.add(mesh.userData.home);
  }

  markerScreen() {
    const p = this.root.localToWorld(this.impact.position.clone()).project(this.camera), r = this.canvas.getBoundingClientRect();
    return [(p.x + 1) / 2 * r.width + r.left, (1 - p.y) / 2 * r.height + r.top];
  }

  bind() {
    const canvas = this.canvas, host = canvas.parentElement;
    let press = null, dragImpact = false;
    // Capture phase on the host runs before the camera rig: grabbing the impact point must not orbit.
    host.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas) return;
      press = { x: e.clientX, y: e.clientY, button: e.button };
      if (e.button === 0 && this.impact.visible && this.aim && !this.sim) {
        const [mx, my] = this.markerScreen();
        if (Math.hypot(mx - e.clientX, my - e.clientY) < 16) {
          dragImpact = true;
          e.stopImmediatePropagation();
          try { canvas.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
          canvas.classList.add('grabbing');
        }
      }
    }, true);
    canvas.addEventListener('pointermove', (e) => {
      if (dragImpact) {
        const hit = this.hitAt(e.clientX, e.clientY), p = hit && this.localHit(hit);
        if (p) this.onImpact(p.toArray(), false);
        return;
      }
      if (e.buttons) return;
      const hit = this.hitAt(e.clientX, e.clientY);
      this.setHover(hit ? hit.object.userData.index : -1);
      const [mx, my] = this.markerScreen();
      canvas.classList.toggle('over-impact', this.impact.visible && Math.hypot(mx - e.clientX, my - e.clientY) < 16);
    });
    canvas.addEventListener('pointerleave', () => this.setHover(-1));
    const up = (e) => {
      if (dragImpact) {
        dragImpact = false; canvas.classList.remove('grabbing');
        const hit = this.hitAt(e.clientX, e.clientY), p = hit && this.localHit(hit);
        this.onImpact(p ? p.toArray() : null, true);
        press = null;
        return;
      }
      // A click (no drag) on the surface places the impact.
      if (press && press.button === 0 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4 && this.aim && this.fractured && !this.sim) {
        const hit = this.hitAt(e.clientX, e.clientY), p = hit && this.localHit(hit);
        if (p) this.onImpact(p.toArray(), true);
      }
      press = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => { dragImpact = false; press = null; canvas.classList.remove('grabbing'); });
  }

  setHover(index, force = false) {
    if (index === this.hovered && !force) return;
    const prev = this.pieces[this.hovered];
    if (prev && prev.userData.base) { for (const m of prev.material) m.dispose(); prev.material = prev.userData.base; delete prev.userData.base; }
    this.hovered = index;
    const mesh = this.pieces[index];
    if (mesh && this.fractured) { mesh.userData.base = mesh.material; mesh.material = mesh.material.map(haloOf); }
    this.onHover(mesh && this.fractured ? mesh.userData.cell : null, index);
  }

  // ------------------------------------------------------------------ camera, frame loop
  frameObject(animate = true) {
    if (!this.result) return;
    const [sx, sy, sz] = this.result.owner.Scale;
    const box = new THREE.Box3(new THREE.Vector3(-sx / 2, 0, -sz / 2), new THREE.Vector3(sx / 2, sy, sz / 2));
    this.rig.frame(box, { yaw: 34, pitch: 18, animate, fill: 1.25 });
  }

  resize() {
    const host = this.canvas.parentElement, w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    if (!this.canvas.offsetParent) return;
    const now = performance.now(), dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    clock.value += dt;
    this.rig.update(dt);
    this.stepSim(dt);
    if (this.cutaway && !this.sim) this.updateCutaway();
    const u = this.floor.material.uniforms;
    u.uFocus.value.copy(this.rig.target);
    u.uRadius.value = Math.max(6, this.rig.distance * 2.6);
    const pulse = 1 + 0.08 * Math.sin(clock.value * 4);
    this.impactGlow.material.opacity = 0.62 * pulse;
    this.renderer.render(this.scene, this.camera);
  }

  // Thumbnail for the inspector card (rendered now, so the drawing buffer is still valid).
  snapshot() {
    try { this.renderer.render(this.scene, this.camera); return this.canvas.toDataURL('image/jpeg', 0.82); } catch { return ''; }
  }
}
