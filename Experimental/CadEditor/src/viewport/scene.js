// three.js scene for the CAD viewport. Kernel results (meshes, edge polylines, curve
// polylines) are turned into BufferGeometry; picking maps hits back to node ids,
// face indices and edge indices using the ranges the kernel reports.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

const COLORS = {
  body: 0xc7ccd4,
  surface: 0x9fb8d6,
  curve: 0x5ea8ff,
  curveSelected: 0xffb347,
  edge: 0x15171b,
  edgeSelected: 0xffb347,
  edgeHover: 0x7fd4ff,
  faceSelected: 0x3d8bff,
  faceHover: 0x7fb6ff,
  handle: 0x42d392,
  handleSelected: 0xffb347,
  grid: 0x2a2d33,
  gridMajor: 0x3b3f47,
  hidden: 0x000000,
};

const DEG = Math.PI / 180;

// Rotation as applied by the kernel: rx, then ry, then rz (R = Rz * Ry * Rx).
export function xfMatrix(xf) {
  const t = xf?.t ?? [0, 0, 0];
  const r = xf?.r ?? [0, 0, 0];
  const s = Number.isFinite(xf?.s) ? xf.s : 1;
  const m = new THREE.Matrix4();
  const rot = new THREE.Matrix4()
    .makeRotationZ(r[2] * DEG)
    .multiply(new THREE.Matrix4().makeRotationY(r[1] * DEG))
    .multiply(new THREE.Matrix4().makeRotationX(r[0] * DEG));
  m.compose(new THREE.Vector3(...t), new THREE.Quaternion().setFromRotationMatrix(rot), new THREE.Vector3(s, s, s));
  return m;
}

// Inverse of xfMatrix for gizmo results: returns { t, r (deg), s }.
export function xfFromMatrix(m) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  const rot = new THREE.Matrix4().makeRotationFromQuaternion(quat);
  const e = new THREE.Euler().setFromRotationMatrix(rot, "ZYX");
  return {
    t: [pos.x, pos.y, pos.z],
    r: [e.x / DEG, e.y / DEG, e.z / DEG],
    s: (scale.x + scale.y + scale.z) / 3,
  };
}

function geometryFromArrays(positions, normals, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (indices) {
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    if (normals?.length === positions.length) g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    else g.computeVertexNormals();
  }
  return g;
}

// Gather index ranges [faceIndex, start, count] for a subset of faces.
function subsetIndices(indices, ranges, wanted) {
  const parts = [];
  let total = 0;
  for (let i = 0; i < ranges.length; i += 3) {
    if (!wanted.has(ranges[i])) continue;
    const slice = indices.subarray(ranges[i + 1], ranges[i + 1] + ranges[i + 2]);
    parts.push(slice);
    total += slice.length;
  }
  const out = new Uint32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function subsetLines(positions, ranges, wanted) {
  const parts = [];
  let total = 0;
  for (let i = 0; i < ranges.length; i += 3) {
    if (!wanted.has(ranges[i])) continue;
    const from = ranges[i + 1] * 3;
    const to = (ranges[i + 1] + ranges[i + 2]) * 3;
    parts.push(positions.subarray(from, to));
    total += to - from;
  }
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export class CadScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.objects = new Map(); // nodeId -> { group, kind, faceTri, bodyMesh, edgeLines, curveLines }
    this.frames = 0;
    this.lastFps = performance.now();
    this.fps = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x17181b, 1);
    this.renderer.domElement.className = "viewport-canvas";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f48, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(600, 900, 700);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xaec8ff, 0.5);
    fill.position.set(-700, 300, -500);
    this.scene.add(fill);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(420, -520, 360);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.target.set(0, 0, 40);

    this.grid = this.makeGrid();
    this.scene.add(this.grid);

    this.handles = new THREE.Group();
    this.scene.add(this.handles);
    this.highlight = new THREE.Group();
    this.scene.add(this.highlight);

    this.proxy = new THREE.Object3D();
    this.scene.add(this.proxy);
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.size = 0.8;
    this.gizmoTarget = null; // { kind: "node", nodeId } | { kind: "point", nodeId, index }
    this.gizmo.addEventListener("dragging-changed", (e) => {
      this.controls.enabled = !e.value;
      if (!e.value) this.commitGizmo();
    });
    this.gizmo.addEventListener("objectChange", () => this.cb.onGizmoLive?.());
    this.scene.add(this.gizmo);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  makeGrid() {
    const group = new THREE.Group();
    const minor = new THREE.GridHelper(4000, 80, COLORS.grid, COLORS.grid);
    minor.rotation.x = Math.PI / 2;
    minor.position.z = 0;
    group.add(minor);
    const axes = new THREE.AxesHelper(120);
    group.add(axes);
    return group;
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    // Keep control-point handles a constant on-screen size.
    if (this.handleRoot) {
      const k = (this.camera.position.distanceTo(this.controls.target) * 0.012) / 1.6;
      for (const c of this.handleRoot.children) if (c.userData.handle) c.scale.setScalar(k);
    }
    this.renderer.render(this.scene, this.camera);
    this.frames += 1;
    const now = performance.now();
    if (now - this.lastFps > 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFps));
      this.frames = 0;
      this.lastFps = now;
      this.cb.onFps?.(this.fps);
    }
  }

  // ---- kernel results -> three objects ----
  clearObjects() {
    for (const entry of this.objects.values()) this.disposeGroup(entry.group);
    this.objects.clear();
  }

  disposeGroup(group) {
    this.scene.remove(group);
    group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  // Rebuild geometry for changed results. `doc` decides visibility and transforms.
  syncResults(doc, results) {
    const wanted = new Set();
    for (const node of Object.values(doc.nodes)) {
      const out = results[node.id];
      if (!node.visible || !out?.ok) {
        this.removeObject(node.id);
        continue;
      }
      wanted.add(node.id);
      const existing = this.objects.get(node.id);
      if (existing && existing.out === out && existing.visible === node.visible) continue;
      this.removeObject(node.id);
      this.objects.set(node.id, this.buildObject(node, out));
    }
    for (const id of [...this.objects.keys()]) if (!wanted.has(id)) this.removeObject(id);
    this.dirtyHandles = true;
  }

  removeObject(id) {
    const entry = this.objects.get(id);
    if (!entry) return;
    this.disposeGroup(entry.group);
    this.objects.delete(id);
  }

  buildObject(node, out) {
    const group = new THREE.Group();
    group.userData.nodeId = node.id;
    const entry = { group, kind: out.kind, out, visible: node.visible, faceTri: null, mesh: null, edges: null, curve: null };
    if (out.kind === "curve") {
      const lines = new THREE.LineSegments(
        geometryFromArrays(out.curve.positions),
        new THREE.LineBasicMaterial({ color: COLORS.curve, linewidth: 2 }),
      );
      lines.userData = { nodeId: node.id, pick: "curve" };
      group.add(lines);
      entry.curve = lines;
    } else {
      const m = out.mesh;
      const isSurface = out.kind === "surface";
      const mat = new THREE.MeshStandardMaterial({
        color: isSurface ? COLORS.surface : COLORS.body,
        roughness: isSurface ? 0.35 : 0.42,
        metalness: 0.04,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        transparent: isSurface,
        opacity: isSurface ? 0.88 : 1,
      });
      const mesh = new THREE.Mesh(geometryFromArrays(m.positions, m.normals, m.indices), mat);
      mesh.userData = { nodeId: node.id, pick: "mesh" };
      group.add(mesh);
      entry.mesh = mesh;
      const triCount = m.indices.length / 3;
      const faceTri = new Int32Array(triCount).fill(-1);
      for (let i = 0; i < m.faceRanges.length; i += 3) {
        const fi = m.faceRanges[i];
        const first = m.faceRanges[i + 1] / 3;
        const last = (m.faceRanges[i + 1] + m.faceRanges[i + 2]) / 3;
        for (let t = first; t < last; t++) faceTri[t] = fi;
      }
      entry.faceTri = faceTri;
      const edgeGeo = geometryFromArrays(out.edges.positions);
      const edgeLines = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.9 }),
      );
      edgeLines.userData = { nodeId: node.id, pick: "edge" };
      group.add(edgeLines);
      entry.edges = edgeLines;
    }
    // Kernel output is already in world space (the node transform is baked in).
    this.scene.add(group);
    return entry;
  }

  // ---- selection highlights and handles ----
  syncSelection(doc, selection, sub) {
    this.highlight.clear();
    for (const entry of this.objects.values()) {
      if (entry.curve) entry.curve.material.color.setHex(COLORS.curve);
      if (entry.edges) entry.edges.material.color.setHex(COLORS.edge);
    }
    for (const id of selection) {
      const entry = this.objects.get(id);
      const s = sub[id];
      if (!entry) continue;
      if (entry.kind === "curve") {
        entry.curve.material.color.setHex(COLORS.curveSelected);
        continue;
      }
      if (s?.faces?.length && entry.mesh) {
        const idx = subsetIndices(entry.mesh.geometry.index.array, entry.out.mesh.faceRanges, new Set(s.faces));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", entry.mesh.geometry.getAttribute("position"));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        const hi = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({ color: COLORS.faceSelected, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }),
        );
        hi.userData.nodeId = id;
        this.highlight.add(hi);
      }
      if (s?.edges?.length && entry.edges) {
        const pos = subsetLines(entry.out.edges.positions, entry.out.edges.ranges, new Set(s.edges));
        const lines = new THREE.LineSegments(
          geometryFromArrays(pos),
          new THREE.LineBasicMaterial({ color: COLORS.edgeSelected, depthTest: false, transparent: true }),
        );
        lines.renderOrder = 5;
        this.highlight.add(lines);
      }
    }
  }

  // Hover highlight for face / edge sub-entities under the pointer.
  setHover(hover) {
    this.hoverGroup?.removeFromParent();
    this.hoverGroup = null;
    if (!hover) return;
    const entry = this.objects.get(hover.nodeId);
    if (!entry) return;
    const g = new THREE.Group();
    if (hover.kind === "face" && entry.mesh) {
      const wanted = new Set([hover.index]);
      const idx = subsetIndices(entry.mesh.geometry.index.array, entry.out.mesh.faceRanges, wanted);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", entry.mesh.geometry.getAttribute("position"));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLORS.faceHover, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })));
    }
    if (hover.kind === "edge" && entry.edges) {
      const pos = subsetLines(entry.out.edges.positions, entry.out.edges.ranges, new Set([hover.index]));
      g.add(new THREE.LineSegments(geometryFromArrays(pos), new THREE.LineBasicMaterial({ color: COLORS.edgeHover, depthTest: false })));
    }
    g.renderOrder = 6;
    this.hoverGroup = g;
    this.highlight.add(g);
  }

  // Control-point handles for curves: spheres at knot / vertex positions.
  syncHandles(doc, selection, point, mode) {
    this.handles.clear();
    this.handleRoot = null;
    if (!(mode === "object" || mode === "curve")) return;
    const id = selection.length === 1 ? selection[0] : null;
    const node = id ? doc.nodes[id] : null;
    if (!node) return;
    const list = node.type === "spline" ? node.params.knots.map((k) => k.p) : ["polyline", "bezier", "fitCurve"].includes(node.type) ? node.params.points : null;
    if (!list) return;
    const group = new THREE.Group();
    group.applyMatrix4(xfMatrix(node.xf));
    const radius = 1.6;
    const geo = new THREE.SphereGeometry(radius, 14, 10);
    list.forEach((p, i) => {
      const selected = point && point.nodeId === id && point.index === i;
      const mat = new THREE.MeshBasicMaterial({ color: selected ? COLORS.handleSelected : COLORS.handle, depthTest: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p[0], p[1], p[2] ?? 0);
      m.renderOrder = 10;
      m.userData = { handle: true, nodeId: id, index: i };
      group.add(m);
    });
    // Polyline of the control polygon for orientation.
    const poly = new THREE.BufferGeometry().setFromPoints(list.map((p) => new THREE.Vector3(p[0], p[1], p[2] ?? 0)));
    const line = new THREE.Line(poly, new THREE.LineDashedMaterial({ color: 0x42d392, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.6, depthTest: false }));
    line.computeLineDistances();
    line.renderOrder = 9;
    group.add(line);
    this.handles.add(group);
    this.handleRoot = group;
    this.handleNodeId = id;
  }

  // ---- gizmo ----
  attachGizmo(doc, selection, point, mode, gizmoTool) {
    const id = selection.length === 1 ? selection[0] : null;
    const node = id ? doc.nodes[id] : null;
    if (point && node && point.nodeId === id && this.handleRoot) {
      const handle = this.handleRoot.children.find((c) => c.userData.handle && c.userData.index === point.index);
      if (handle) {
        this.gizmo.setMode("translate");
        this.gizmo.attach(handle);
        this.gizmoTarget = { kind: "point", nodeId: id, index: point.index };
        this.gizmo.visible = true;
        this.gizmo.enabled = true;
        return;
      }
    }
    if (node && (mode === "object" || mode === "curve" || mode === "face" || mode === "edge") && selection.length === 1) {
      const mat = xfMatrix(node.xf);
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      mat.decompose(p, q, s);
      // Gizmo position is the body pivot (origin of the transform).
      this.proxy.position.copy(p);
      this.proxy.quaternion.copy(q);
      this.proxy.scale.copy(s);
      this.proxy.updateMatrixWorld();
      const tool = gizmoTool === "rotate" ? "rotate" : gizmoTool === "scale" ? "scale" : "translate";
      this.gizmo.setMode(tool);
      this.gizmo.attach(this.proxy);
      this.gizmoTarget = { kind: "node", nodeId: id };
      this.gizmo.visible = true;
      this.gizmo.enabled = true;
      return;
    }
    this.gizmo.detach();
    this.gizmoTarget = null;
    this.gizmo.visible = false;
  }

  commitGizmo() {
    const target = this.gizmoTarget;
    if (!target) return;
    if (target.kind === "point") {
      const handle = this.handleRoot?.children.find((c) => c.userData.handle && c.userData.index === target.index);
      if (!handle) return;
      const local = handle.position.clone();
      this.cb.onPointMoved?.(target.nodeId, target.index, [local.x, local.y, local.z]);
      return;
    }
    this.proxy.updateMatrixWorld(true);
    this.cb.onNodeTransformed?.(target.nodeId, xfFromMatrix(this.proxy.matrixWorld));
  }

  // ---- picking ----
  pick(clientX, clientY, mode) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.raycaster.params.Line.threshold = Math.max(0.5, dist * 0.006);
    this.raycaster.params.Points.threshold = 2;

    if (this.handleRoot) {
      const hits = this.raycaster.intersectObjects(this.handleRoot.children, false);
      const h = hits.find((x) => x.object.userData.handle);
      if (h) return { kind: "point", nodeId: h.object.userData.nodeId, index: h.object.userData.index };
    }

    const candidates = [];
    for (const [id, entry] of this.objects) {
      if (mode === "face" && entry.mesh) candidates.push(entry.mesh);
      else if (mode === "edge" && entry.edges) candidates.push(entry.edges);
      else if (entry.kind === "curve") candidates.push(entry.curve);
      else {
        if (entry.mesh) candidates.push(entry.mesh);
        if (mode === "object" && entry.edges) candidates.push(entry.edges);
      }
      void id;
    }
    const hits = this.raycaster.intersectObjects(candidates, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const nodeId = hit.object.userData.nodeId;
    const entry = this.objects.get(nodeId);
    if (!entry) return null;
    if (hit.object.userData.pick === "mesh") {
      if (mode === "face") {
        const fi = entry.faceTri[hit.faceIndex];
        return { kind: "face", nodeId, index: fi, point: hit.point };
      }
      return { kind: "node", nodeId, point: hit.point };
    }
    if (hit.object.userData.pick === "edge") {
      const ranges = entry.out.edges.ranges;
      const v = hit.index;
      let edge = -1;
      for (let i = 0; i < ranges.length; i += 3) {
        if (v >= ranges[i + 1] && v < ranges[i + 1] + ranges[i + 2]) {
          edge = ranges[i];
          break;
        }
      }
      if (mode === "edge") return { kind: "edge", nodeId, index: edge, point: hit.point };
      return { kind: "node", nodeId, point: hit.point };
    }
    return { kind: "node", nodeId, point: hit.point };
  }

  // ---- camera ----
  setPreset(preset, target = null) {
    const c = target ?? this.controls.target.clone();
    const d = this.camera.position.distanceTo(this.controls.target) || 600;
    const dirs = {
      perspective: [0.6, -0.8, 0.5],
      top: [0, 0, 1],
      front: [0, -1, 0],
      right: [1, 0, 0],
      left: [-1, 0, 0],
      back: [0, 1, 0],
      bottom: [0, 0, -1],
    };
    const v = new THREE.Vector3(...(dirs[preset] ?? dirs.perspective)).normalize().multiplyScalar(d);
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(v);
    if (preset === "top") this.camera.up.set(0, 1, 0);
    else this.camera.up.set(0, 0, 1);
    this.controls.update();
  }

  frameBox(min, max) {
    const box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
    const size = box.getSize(new THREE.Vector3()).length() || 100;
    const center = box.getCenter(new THREE.Vector3());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(dir.multiplyScalar(size * 1.1));
    this.camera.near = Math.max(0.1, size / 500);
    this.camera.far = size * 40;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  // Bounding box of all visible results (or of the selection when given).
  boundsOf(doc, results, ids = null) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const node of Object.values(doc.nodes)) {
      if (!node.visible) continue;
      if (ids && !ids.includes(node.id)) continue;
      const out = results[node.id];
      if (!out?.ok || !out.bbox) continue;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], out.bbox.min[i]);
        max[i] = Math.max(max[i], out.bbox.max[i]);
      }
    }
    if (!Number.isFinite(min[0])) return null;
    return { min, max };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.gizmo.dispose();
    this.controls.dispose();
    this.clearObjects();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
