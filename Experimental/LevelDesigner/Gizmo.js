// Transform gizmo built from shaded solids (no line helpers, no TransformControls):
//   move    three arrows (shaft + cone), three plane tiles and a centre ball for camera-plane moves
//   rotate  three tori, one per axis
//   scale   three stems with cube tips and a centre cube for uniform scale
// It keeps a constant screen size, draws over the scene, and drags its target Object3D directly; the Designer hears
// onDrag (live) and onCommit (pointer up) and writes the result back into the level document.
// Space: 'world' or 'local' (scale is always local). Snap: 0.25 m, 15°, 0.1 (hold Ctrl to invert the snap toggle).
import { THREE } from '../Shared/Studio/Render.js';

const AXES = [
  { name: 'x', dir: new THREE.Vector3(1, 0, 0), color: '#e0605a' },
  { name: 'y', dir: new THREE.Vector3(0, 1, 0), color: '#6fcf6a' },
  { name: 'z', dir: new THREE.Vector3(0, 0, 1), color: '#5a8de0' },
];
const HOVER = new THREE.Color('#ffb238');
const LOCKED = new THREE.Color('#77797d');
export const SNAP = { move: 0.25, rotate: 15, scale: 0.1 };

function shade(color) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.05, depthTest: false, depthWrite: false, transparent: true, opacity: 0.98 });
  m.userData.base = new THREE.Color(color);
  return m;
}

// An invisible, fatter twin for picking.
function pickTwin(geometry) {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  m.userData.pickOnly = true;
  return m;
}

const up = new THREE.Vector3(0, 1, 0);
function alongAxis(mesh, dir, offset) {
  mesh.quaternion.setFromUnitVectors(up, dir);
  mesh.position.copy(dir).multiplyScalar(offset);
  return mesh;
}

export class Gizmo {
  constructor(stage, { onDrag = () => {}, onCommit = () => {}, onRefused = () => {} } = {}) {
    this.stage = stage;
    this.onDrag = onDrag; this.onCommit = onCommit; this.onRefused = onRefused;
    this.mode = 'move';               // 'select' hides the gizmo
    this.space = 'world';
    this.snap = false;
    this.target = null;
    this.locked = false;
    this.root = new THREE.Group();
    this.root.name = 'Gizmo';
    this.root.visible = false;
    stage.overlay.add(this.root);
    this.sets = { move: this.buildMove(), rotate: this.buildRotate(), scale: this.buildScale() };
    for (const g of Object.values(this.sets)) this.root.add(g);
    this.handles = [];
    this.root.traverse((o) => { if (o.userData.handle && o.userData.pickOnly) this.handles.push(o); });
    this.raycaster = new THREE.Raycaster();
    this.hover = null;
    this.drag = null;
    stage.frameCallbacks.add(() => this.tick());
    this.bind();
  }

  // ------------------------------------------------------------------------------------------------------ parts
  part(group, handle, visual, pickGeo) {
    visual.renderOrder = 100;
    visual.userData.handle = handle;
    const pick = pickTwin(pickGeo);
    pick.position.copy(visual.position); pick.quaternion.copy(visual.quaternion); pick.rotation.copy(visual.rotation);
    pick.userData.handle = handle;
    group.add(visual, pick);
  }

  buildMove() {
    const g = new THREE.Group();
    for (const a of AXES) {
      const m = shade(a.color);
      this.part(g, `move-${a.name}`, alongAxis(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 14), m), a.dir, 0.47), new THREE.CylinderGeometry(0.08, 0.08, 1.05, 8));
      const pick = g.children[g.children.length - 1];
      alongAxis(pick, a.dir, 0.6);
      this.part(g, `move-${a.name}`, alongAxis(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 24), m), a.dir, 0.96), new THREE.ConeGeometry(0.1, 0.3, 8));
    }
    // plane tiles: the tile for plane "xy" sits between X and Y and moves in that plane (normal z)
    const planes = [['xy', 'z', [0.3, 0.3, 0]], ['yz', 'x', [0, 0.3, 0.3]], ['xz', 'y', [0.3, 0, 0.3]]];
    for (const [name, normal, at] of planes) {
      const a = AXES.find((x) => x.name === normal);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.012), shade(a.color));
      tile.material.opacity = 0.75;
      tile.position.fromArray(at);
      if (normal === 'x') tile.rotation.y = Math.PI / 2;
      if (normal === 'y') tile.rotation.x = Math.PI / 2;
      this.part(g, `plane-${normal}`, tile, new THREE.BoxGeometry(0.22, 0.22, 0.06));
    }
    this.part(g, 'move-view', new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), shade('#e8e8e8')), new THREE.SphereGeometry(0.12, 10, 8));
    return g;
  }

  buildRotate() {
    const g = new THREE.Group();
    for (const a of AXES) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.018, 12, 96), shade(a.color));
      // a torus lies in XY (normal +Z); turn it so its normal is the axis
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.dir);
      this.part(g, `rotate-${a.name}`, ring, new THREE.TorusGeometry(0.82, 0.075, 6, 48));
    }
    g.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), shade('#e8e8e8')), { renderOrder: 100 }));
    return g;
  }

  buildScale() {
    const g = new THREE.Group();
    for (const a of AXES) {
      const m = shade(a.color);
      this.part(g, `scale-${a.name}`, alongAxis(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 12), m), a.dir, 0.45), new THREE.CylinderGeometry(0.08, 0.08, 0.95, 8));
      alongAxis(g.children[g.children.length - 1], a.dir, 0.5);
      this.part(g, `scale-${a.name}`, alongAxis(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), m), a.dir, 0.9), new THREE.BoxGeometry(0.2, 0.2, 0.2));
    }
    this.part(g, 'scale-all', new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), shade('#e8e8e8')), new THREE.BoxGeometry(0.2, 0.2, 0.2));
    return g;
  }

  // ------------------------------------------------------------------------------------------------------ state
  attach(object, { locked = false, moveOnly = false } = {}) {
    this.target = object;
    this.locked = locked;
    this.moveOnly = moveOnly;          // hotspot anchors are points: they only move
    this.tick();
  }

  detach() { this.target = null; this.drag = null; this.tick(); }

  assignMode(mode) { this.mode = mode; this.tick(); }

  // The handle set on screen: the chosen mode, or Move for point targets.
  shownMode() { return this.moveOnly && this.mode !== 'select' ? 'move' : this.mode; }

  // Gizmo axes in world space for the current mode / space.
  axisFrame() {
    const q = new THREE.Quaternion();
    if (this.target && !this.moveOnly && (this.space === 'local' || this.shownMode() === 'scale')) this.target.getWorldQuaternion(q);
    return q;
  }

  tick() {
    const on = !!this.target && this.mode !== 'select' && this.target.visible !== false;
    this.root.visible = on;
    if (!on) return;
    for (const [k, g] of Object.entries(this.sets)) g.visible = k === this.shownMode();
    this.target.getWorldPosition(this.root.position);
    this.root.quaternion.copy(this.axisFrame());
    const cam = this.stage.camera;
    const d = cam.position.distanceTo(this.root.position);
    this.root.scale.setScalar(d * Math.tan((cam.fov * Math.PI) / 360) * 0.32);
    const active = this.drag ? this.drag.handle : this.hover;
    this.root.traverse((o) => {
      if (!o.isMesh || o.userData.pickOnly || !o.material.userData.base) return;
      const c = this.locked ? LOCKED : o.userData.handle && o.userData.handle === active ? HOVER : o.material.userData.base;
      o.material.color.copy(c); o.material.emissive.copy(c);
    });
  }

  // ------------------------------------------------------------------------------------------------------ input
  rayAt(e) {
    const rect = this.stage.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    return this.raycaster.ray;
  }

  handleAt(e) {
    if (!this.root.visible) return null;
    this.rayAt(e);
    this.root.updateMatrixWorld(true);
    const live = this.handles.filter((h) => h.parent.visible);
    const hit = this.raycaster.intersectObjects(live, false)[0];
    return hit ? hit.object.userData.handle : null;
  }

  bind() {
    const well = this.stage.canvas.parentElement;
    // Capture on the well so a handle grab never reaches the camera rig on the canvas.
    well.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== this.stage.canvas) return;
      const handle = this.handleAt(e);
      if (!handle) return;
      e.stopPropagation();
      e.preventDefault();
      if (this.locked) { this.onRefused(); return; }
      this.begin(handle, e);
    }, true);
    addEventListener('pointermove', (e) => {
      if (this.drag) { this.move(e); return; }
      if (e.target !== this.stage.canvas || e.buttons) return;
      const h = this.handleAt(e);
      if (h !== this.hover) { this.hover = h; this.stage.canvas.style.cursor = h ? (this.locked ? 'not-allowed' : 'grab') : ''; }
    });
    addEventListener('pointerup', () => this.end());
    addEventListener('pointercancel', () => this.end());
  }

  begin(handle, e) {
    const t = this.target;
    const [kind, axisName] = handle.split('-');
    const frame = this.axisFrame();
    const axis = AXES.find((a) => a.name === axisName);
    const centre = t.getWorldPosition(new THREE.Vector3());
    const camDir = this.stage.camera.getWorldDirection(new THREE.Vector3());
    let plane, dir = null;
    if (kind === 'move' && axis || kind === 'scale' && axis) {
      dir = axis.dir.clone().applyQuaternion(frame);
      // the plane that contains the axis and faces the camera most
      const n = camDir.clone().cross(dir).cross(dir).normalize();
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n.lengthSq() > 1e-6 ? n : camDir.clone().negate(), centre);
    } else if (kind === 'plane') {
      dir = AXES.find((a) => a.name === axisName).dir.clone().applyQuaternion(frame);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, centre);
    } else if (kind === 'rotate') {
      dir = axis.dir.clone().applyQuaternion(frame);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, centre);
    } else {
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.clone().negate(), centre);
    }
    const start = this.rayAt(e).intersectPlane(plane, new THREE.Vector3());
    if (!start) return;
    this.drag = {
      handle, kind, axisName, dir, plane, start, centre, y0: e.clientY, ctrl: e.ctrlKey,
      position: t.position.clone(), quaternion: t.quaternion.clone(), scale: t.scale.clone(),
      size: this.root.scale.x,
      enclosingInverse: t.parent ? new THREE.Matrix4().copy(t.parent.matrixWorld).invert() : new THREE.Matrix4(),
    };
    this.stage.canvas.style.cursor = 'grabbing';
    this.stage.rig.cancelFlight();
  }

  move(e) {
    const d = this.drag, t = this.target;
    if (!t) return;
    const snapping = this.snap !== e.ctrlKey;
    const hit = this.rayAt(e).intersectPlane(d.plane, new THREE.Vector3());
    if (d.kind === 'scale' && d.axisName === 'all') {
      let k = Math.max(0.05, 1 + (d.y0 - e.clientY) / 150);
      if (snapping) k = Math.max(SNAP.scale, Math.round(k / SNAP.scale) * SNAP.scale);
      t.scale.copy(d.scale).multiplyScalar(k);
    } else if (!hit) {
      return;
    } else if (d.kind === 'move' || d.kind === 'plane') {
      const delta = hit.clone().sub(d.start);
      if (d.kind === 'move' && d.dir) delta.copy(d.dir).multiplyScalar(delta.dot(d.dir));
      const world = d.centre.clone().add(delta);
      if (snapping) world.set(Math.round(world.x / SNAP.move) * SNAP.move, Math.round(world.y / SNAP.move) * SNAP.move, Math.round(world.z / SNAP.move) * SNAP.move);
      if (d.kind === 'move' && d.dir && snapping) {           // keep the move on its axis after snapping
        const along = world.clone().sub(d.centre).dot(d.dir);
        world.copy(d.centre).addScaledVector(d.dir, along);
      }
      t.position.copy(world.applyMatrix4(d.enclosingInverse));
    } else if (d.kind === 'rotate') {
      const a = d.start.clone().sub(d.centre).normalize(), b = hit.clone().sub(d.centre).normalize();
      let angle = Math.atan2(a.clone().cross(b).dot(d.dir), a.dot(b));
      if (snapping) angle = Math.round(angle / (SNAP.rotate * Math.PI / 180)) * (SNAP.rotate * Math.PI / 180);
      const q = new THREE.Quaternion().setFromAxisAngle(d.dir, angle);
      // world rotation about the axis, expressed in the enclosing frame
      const enclosingQ = new THREE.Quaternion();
      if (t.parent) t.parent.getWorldQuaternion(enclosingQ);
      const worldQ = enclosingQ.clone().multiply(d.quaternion);
      t.quaternion.copy(enclosingQ.invert().multiply(q.multiply(worldQ)));
    } else if (d.kind === 'scale') {
      const along = hit.clone().sub(d.start).dot(d.dir) / Math.max(1e-3, d.size);
      let k = Math.max(0.05, 1 + along);
      if (snapping) k = Math.max(SNAP.scale, Math.round(k / SNAP.scale) * SNAP.scale);
      const i = { x: 0, y: 1, z: 2 }[d.axisName];
      const s = d.scale.clone();
      s.setComponent(i, d.scale.getComponent(i) * k);
      t.scale.copy(s);
    }
    t.updateMatrixWorld(true);
    this.onDrag(t);
  }

  end() {
    if (!this.drag) return;
    const moved = !this.target || !this.target.position.equals(this.drag.position) || !this.target.quaternion.equals(this.drag.quaternion) || !this.target.scale.equals(this.drag.scale);
    this.drag = null;
    this.stage.canvas.style.cursor = '';
    if (moved && this.target) this.onCommit(this.target);
  }

  // Test hook: drags a handle by a world-space delta (move), an angle in degrees (rotate) or a factor (scale).
  nudge(handle, amount) {
    if (!this.target || this.locked) { if (this.locked) this.onRefused(); return false; }
    const [kind, axisName] = handle.split('-');
    if (this.moveOnly && kind !== 'move') return false;
    const axis = AXES.find((a) => a.name === axisName);
    const dir = axis ? axis.dir.clone().applyQuaternion(this.axisFrame()) : null;
    const t = this.target;
    if (kind === 'move' && dir) {
      const enclosingInverse = t.parent ? new THREE.Matrix4().copy(t.parent.matrixWorld).invert() : new THREE.Matrix4();
      const w = t.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, amount);
      t.position.copy(w.applyMatrix4(enclosingInverse));
    } else if (kind === 'rotate' && dir) {
      t.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, (amount * Math.PI) / 180));
    } else if (kind === 'scale') {
      if (axisName === 'all') t.scale.multiplyScalar(amount);
      else t.scale.setComponent({ x: 0, y: 1, z: 2 }[axisName], t.scale.getComponent({ x: 0, y: 1, z: 2 }[axisName]) * amount);
    } else return false;
    t.updateMatrixWorld(true);
    this.onCommit(t);
    return true;
  }
}
