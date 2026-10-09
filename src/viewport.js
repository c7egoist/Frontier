// ---------------------------------------------------------------------------
// viewport.js — split-view renderer: one WebGL canvas, two cameras, one
// shared scene. Left = 2D orthographic plan (top-down, pan/zoom). Right =
// 3D perspective (orbit/pan/dolly). A draggable divider sets the split.
//
// Layers:  0 = everything (network, editor overlays, grid, draw plane)
//          1 = ground + water (3D view only — the plan view stays clean)
//          2 = the 2D gizmo (2D view only, constant pixel size in plan)
//          3 = the 3D gizmo (3D view only)
// ---------------------------------------------------------------------------

import * as THREE from '../vendor/three.module.min.js';
import { roadToWorld } from './math.js';
import { sampleCenterline } from './topology.js';
import { createGizmo } from './gizmo.js';

export const LAYER_SCENE = 1;
export const LAYER_2D = 2;
export const LAYER_3D = 3;

const WORLD_BG = 0x0b0b0b;

/** Convert one patch (grid of road-space points) to a world-space BufferGeometry. */
export function patchToGeometry(p) {
  const rows = p.grid.length;
  const cols = p.grid[0].length;
  const verts = new Float32Array(rows * cols * 3);
  let k = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const w = roadToWorld(p.grid[i][j]);
      verts[k++] = w[0]; verts[k++] = w[1]; verts[k++] = w[2];
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = i * cols + (j + 1);
      const c = (i + 1) * cols + (j + 1);
      const d = (i + 1) * cols + j;
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Fallback merge for builds without THREE.BufferGeometryUtils (the vendored
 * core build does not ship it): concatenates indexed geometries, offsetting
 * each index block by the running vertex count.
 */
export function mergeGeometriesManual(geos) {
  let vertCount = 0;
  let indexCount = 0;
  for (const g of geos) {
    vertCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : 0;
  }
  if (vertCount === 0) return null;
  const verts = new Float32Array(vertCount * 3);
  const norms = new Float32Array(vertCount * 3);
  const idx = new Uint32Array(indexCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal ? g.attributes.normal.array : null;
    verts.set(pos, vo * 3);
    if (nor) norms.set(nor, vo * 3);
    const off = vo;
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + off;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) idx[io++] = i + off;
    }
    vo += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function createViewport(container, callbacks = {}) {
  const { onCursor } = callbacks;

  // --- renderer / scene -----------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(WORLD_BG, 1);
  renderer.autoClear = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x8a8a8a, 0.55));
  scene.add(new THREE.HemisphereLight(0x3d3d3d, 0x0a0a0a, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 50, 20);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-20, 30, -30);
  scene.add(fill);

  // --- static scene furniture ------------------------------------------------
  const grid = new THREE.GridHelper(600, 150, 0x3a3a3a, 0x1e1e1e);
  grid.position.y = 0.02;
  scene.add(grid);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(500, 64),
    new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.layers.set(LAYER_SCENE);
  scene.add(ground);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(500, 64),
    new THREE.MeshStandardMaterial({ color: 0x17333d, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.88 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.layers.set(LAYER_SCENE);
  scene.add(water);

  // invisible click plane at draw height (drawing + deselect)
  const drawPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  drawPlane.rotation.x = -Math.PI / 2;
  scene.add(drawPlane);

  // --- dynamic groups ---------------------------------------------------------
  const networkGroup = new THREE.Group();
  networkGroup.name = 'network';
  scene.add(networkGroup);
  const overlayGroup = new THREE.Group(); // centerlines, nodes, handles, junction markers
  overlayGroup.name = 'overlay';
  scene.add(overlayGroup);

  // --- cameras -----------------------------------------------------------------
  const cam3d = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);
  cam3d.layers.enable(LAYER_SCENE);
  cam3d.layers.enable(LAYER_3D); // 3D gizmo only in the perspective view
  const cam2d = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
  cam2d.up.set(0, 0, -1);
  cam2d.layers.enable(LAYER_2D); // 2D gizmo only in the plan view

  // 3D orbit rig
  const orbit = { target: new THREE.Vector3(0, 0, 0), radius: 90, theta: Math.PI * 0.25, phi: Math.PI * 0.35 };
  function updateCam3d() {
    const sp = Math.sin(orbit.phi);
    cam3d.position.set(
      orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta),
    );
    cam3d.near = Math.max(0.1, orbit.radius / 300);
    cam3d.far = orbit.radius * 30 + 2000;
    cam3d.updateProjectionMatrix();
    cam3d.lookAt(orbit.target);
  }

  // 2D pan/zoom rig (top-down ortho)
  const plan = { cx: 0, cz: 0, halfH: 45, zoom: 1 };
  function updateCam2d(aspect) {
    const halfH = plan.halfH / plan.zoom;
    const halfW = halfH * aspect;
    cam2d.left = -halfW; cam2d.right = halfW;
    cam2d.top = halfH; cam2d.bottom = -halfH;
    cam2d.position.set(plan.cx, 200, plan.cz);
    cam2d.zoom = 1; // frustum already encodes zoom
    cam2d.updateProjectionMatrix();
    cam2d.lookAt(plan.cx, 0, plan.cz);
  }

  updateCam3d();
  updateCam2d(1);

  // --- split state ---------------------------------------------------------------
  let split = 0.5; // fraction of width for the 2D view
  let size = { w: 1, h: 1 };

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    size = { w, h };
    renderer.setSize(w, h, false);
    cam3d.aspect = Math.max(0.1, (w * (1 - split)) / h);
    cam3d.updateProjectionMatrix();
    updateCam2d(Math.max(0.1, (w * split) / h));
  }
  resize();

  function setSplit(f) {
    split = Math.min(0.92, Math.max(0.08, f));
    resize();
  }

  // --- gizmos (one per view for constant pixel size) ------------------------------
  let gizmo3d = null;
  let gizmo2d = null;
  let gizmoTarget = null; // { position, onDeltaTotal }

  function ensureGizmos() {
    if (gizmo3d) return;
    const mk = (layer) => {
      const g = createGizmo({
        onDeltaTotal: (dx, dy, dz) => gizmoTarget && gizmoTarget.onDeltaTotal(dx, dy, dz),
        onInteract: () => callbacks.onInteract && callbacks.onInteract(),
        pixelSize: 85,
      });
      g.group.layers.set(layer);
      scene.add(g.group);
      return g;
    };
    gizmo3d = mk(LAYER_3D);
    gizmo2d = mk(LAYER_2D);
  }

  function setGizmo(target) {
    ensureGizmos();
    gizmoTarget = target;
    const vis = !!target;
    gizmo3d.setVisible(vis);
    gizmo2d.setVisible(vis);
    if (target) {
      gizmo3d.setPosition(target.position);
      gizmo2d.setPosition(target.position);
    }
  }

  // --- network meshes (patches merged by color / decal) ----------------------------
  function setNetwork(net) {
    for (const child of [...networkGroup.children]) {
      networkGroup.remove(child);
      child.geometry && child.geometry.dispose();
      child.material && child.material.dispose && child.material.dispose();
    }
    if (!net) return;
    const buckets = new Map(); // key -> { color, decal, patches: [] }
    const add = (patches) => {
      for (const p of patches) {
        const key = `${p.fill_color}|${p.decal ? 1 : 0}`;
        if (!buckets.has(key)) buckets.set(key, { color: p.fill_color, decal: !!p.decal, patches: [] });
        buckets.get(key).patches.push(p);
      }
    };
    for (const sp of net.spans) add(sp.patches);
    for (const j of net.junctions) add(j.patches);
    for (const [key, bucket] of buckets) {
      const geos = bucket.patches.map(patchToGeometry);
      const merged = THREE.BufferGeometryUtils
        ? THREE.BufferGeometryUtils.mergeGeometries(geos)
        : mergeGeometriesManual(geos);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(bucket.color),
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0.05,
      });
      if (bucket.decal) {
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -2;
        mat.polygonOffsetUnits = -2;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `net-${key}`;
      networkGroup.add(mesh);
    }
  }

  // --- editor overlays (centerlines, nodes, handles, junction markers) -------------
  const nodeMeshes = []; // { splineId, nodeId, hit, mesh }
  const junctionMeshes = []; // { junctionId, hit, mesh }
  let centerLines = [];

  function clearOverlay() {
    for (const child of [...overlayGroup.children]) {
      overlayGroup.remove(child);
      child.geometry && child.geometry.dispose();
      child.material && child.material.dispose && child.material.dispose();
    }
    nodeMeshes.length = 0;
    junctionMeshes.length = 0;
    centerLines = [];
  }

  function setProject(project, selection, activeSplineId, mode, net) {
    clearOverlay();
    if (!project) return;
    const selNodeId = selection && selection.kind === 'node' ? selection.nodeId : null;
    const selSplineId = selection && (selection.kind === 'spline' || selection.kind === 'node') ? selection.splineId : null;
    const selJunctionId = selection && selection.kind === 'junction' ? selection.junctionId : null;

    // centerlines
    for (const s of project.splines) {
      if (!s.visible || s.nodes.length < 2) continue;
      const pts = sampleCenterline(s, 24).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(s.color),
          transparent: true,
          opacity: s.id === activeSplineId ? 0.95 : 0.45,
        }),
      );
      overlayGroup.add(line);
      centerLines.push(line);
    }

    // nodes
    for (const s of project.splines) {
      if (!s.visible) continue;
      s.nodes.forEach((node, index) => {
        const isEndpoint = !s.closed && (index === 0 || index === s.nodes.length - 1);
        const isSel = node.id === selNodeId && s.id === selSplineId;
        const isActive = s.id === activeSplineId;
        const color = isSel ? '#ffffff' : (mode === 'draw' && isEndpoint ? '#7fc97f' : s.color);
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.3, 0),
          new THREE.MeshBasicMaterial({ color }),
        );
        mesh.position.set(...node.position);
        mesh.scale.setScalar(isSel ? 1.3 : 1);
        overlayGroup.add(mesh);
        if (isSel) {
          const ring = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.46, 0),
            new THREE.MeshBasicMaterial({ color: s.color, wireframe: true, transparent: true, opacity: 0.9 }),
          );
          ring.position.set(...node.position);
          overlayGroup.add(ring);
          // bezier handle lines + drag boxes
          const hin = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(...node.position),
              new THREE.Vector3(...node.handleIn),
            ]),
            new THREE.LineBasicMaterial({ color: 0x7fb2e8, transparent: true, opacity: 0.55 }),
          );
          const hout = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(...node.position),
              new THREE.Vector3(...node.handleOut),
            ]),
            new THREE.LineBasicMaterial({ color: 0xe88a7f, transparent: true, opacity: 0.55 }),
          );
          overlayGroup.add(hin);
          overlayGroup.add(hout);
          const hInBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.24, 0.24),
            new THREE.MeshBasicMaterial({ color: 0x7fb2e8 }),
          );
          hInBox.position.set(...node.handleIn);
          hInBox.userData = { handleOf: { splineId: s.id, nodeId: node.id, which: 'in' } };
          overlayGroup.add(hInBox);
          const hOutBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.24, 0.24),
            new THREE.MeshBasicMaterial({ color: 0xe88a7f }),
          );
          hOutBox.position.set(...node.handleOut);
          hOutBox.userData = { handleOf: { splineId: s.id, nodeId: node.id, which: 'out' } };
          overlayGroup.add(hOutBox);
        }
        const hit = new THREE.Mesh(
          new THREE.SphereGeometry(1.0, 8, 8),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, depthTest: false }),
        );
        hit.position.set(...node.position);
        hit.userData = { nodeRef: { splineId: s.id, nodeId: node.id, isEndpoint } };
        overlayGroup.add(hit);
        nodeMeshes.push({ splineId: s.id, nodeId: node.id, hit, mesh, isActive });
      });
    }

    // junction markers
    if (net) {
      for (const j of net.junctions) {
        const isSel = j.id === selJunctionId;
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(isSel ? 0.5 : 0.34, 0),
          new THREE.MeshBasicMaterial({ color: isSel ? '#ffffff' : '#e8b65f' }),
        );
        mesh.position.set(j.position[0], j.position[1] + 0.4, j.position[2]);
        overlayGroup.add(mesh);
        const hit = new THREE.Mesh(
          new THREE.SphereGeometry(2.6, 8, 8),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, depthTest: false }),
        );
        hit.position.set(j.position[0], j.position[1] + 1, j.position[2]);
        hit.userData = { junctionRef: { junctionId: j.id } };
        overlayGroup.add(hit);
        junctionMeshes.push({ junctionId: j.id, hit, mesh });
      }
    }
  }

  // --- scene settings ---------------------------------------------------------------
  function setSceneSettings(sceneSettings) {
    grid.visible = !!sceneSettings.showGrid;
    ground.visible = !!sceneSettings.showGround;
    ground.position.y = sceneSettings.groundZ;
    grid.position.y = sceneSettings.groundZ + 0.02;
    water.visible = !!sceneSettings.showWater;
    water.position.y = sceneSettings.waterLevel;
    drawPlane.position.y = sceneSettings.drawHeight;
  }

  // --- picking ------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;

  function viewAt(clientX) {
    const rect = renderer.domElement.getBoundingClientRect();
    const fx = (clientX - rect.left) / Math.max(1, rect.width);
    return fx < split ? '2d' : '3d';
  }

  function cameraForView(view) { return view === '2d' ? cam2d : cam3d; }

  function rayFromClient(clientX, clientY) {
    const view = viewAt(clientX);
    const camera = cameraForView(view);
    const rect = renderer.domElement.getBoundingClientRect();
    // local coords within this view's half
    const localW = view === '2d' ? rect.width * split : rect.width * (1 - split);
    const localX = view === '2d' ? clientX - rect.left : clientX - (rect.left + rect.width * split);
    const nx = (localX / Math.max(1, localW)) * 2 - 1;
    const ny = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    raycaster.layers.mask = view === '2d'
      ? (1 | (1 << LAYER_2D))
      : (1 | (1 << LAYER_SCENE) | (1 << LAYER_3D));
    return { ray: raycaster.ray, camera, view };
  }

  function pick(clientX, clientY) {
    const { ray, view } = rayFromClient(clientX, clientY);
    // gizmo first
    const gz = view === '2d' ? gizmo2d : gizmo3d;
    if (gz && gz.group.visible) {
      const part = gz.pick(raycaster);
      if (part) return { kind: 'gizmo', part, view };
    }
    // junction markers
    const jHits = raycaster.intersectObjects(junctionMeshes.map((j) => j.hit), false);
    if (jHits.length > 0) return { kind: 'junction', junctionId: jHits[0].object.userData.junctionRef.junctionId, view };
    // nodes
    const nHits = raycaster.intersectObjects(nodeMeshes.map((n) => n.hit), false);
    if (nHits.length > 0) {
      const ref = nHits[0].object.userData.nodeRef;
      return { kind: 'node', splineId: ref.splineId, nodeId: ref.nodeId, isEndpoint: ref.isEndpoint, view };
    }
    // handle boxes
    const hHits = raycaster.intersectObjects(
      overlayGroup.children.filter((c) => c.userData && c.userData.handleOf),
      false,
    );
    if (hHits.length > 0) {
      const h = hHits[0].object.userData.handleOf;
      return { kind: 'handle', splineId: h.splineId, nodeId: h.nodeId, which: h.which, view };
    }
    // ground / draw plane
    const gHits = raycaster.intersectObject(drawPlane, false);
    if (gHits.length > 0) {
      const p = gHits[0].point;
      return { kind: 'ground', point: [p.x, p.y, p.z], view };
    }
    return { kind: 'empty', view };
  }

  function gizmoAt(clientX, clientY) {
    const view = viewAt(clientX);
    const gz = view === '2d' ? gizmo2d : gizmo3d;
    if (!gz || !gz.group.visible) return null;
    const { ray } = rayFromClient(clientX, clientY);
    const part = gz.pick(raycaster);
    return part ? { part, view, gizmo: gz, ray } : null;
  }

  /** Project a world point to view-local CSS pixels (for overlay labels). */
  function projectToScreen(view, worldPos) {
    const camera = cameraForView(view);
    const v = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    if (view === '2d') {
      const localW = rect.width * split;
      return { x: rect.left - rect.left + ((v.x + 1) / 2) * localW, y: ((1 - v.y) / 2) * rect.height };
    }
    const localW = rect.width * (1 - split);
    return { x: rect.width * split + ((v.x + 1) / 2) * localW, y: ((1 - v.y) / 2) * rect.height };
  }

  // --- camera drag (orbit / pan / zoom) ------------------------------------------------
  const camDrag = { active: false, view: null, lastX: 0, lastY: 0, button: 0 };

  function worldPerPixel3d(clientX, clientY) {
    const { camera } = rayFromClient(clientX, clientY);
    const dist = camera.position.distanceTo(orbit.target);
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, size.h);
  }

  function startCameraDrag(clientX, clientY, button) {
    camDrag.active = true;
    camDrag.view = viewAt(clientX);
    camDrag.lastX = clientX;
    camDrag.lastY = clientY;
    camDrag.button = button;
  }

  function moveCameraDrag(clientX, clientY) {
    if (!camDrag.active) return;
    const dx = clientX - camDrag.lastX;
    const dy = clientY - camDrag.lastY;
    camDrag.lastX = clientX;
    camDrag.lastY = clientY;
    if (camDrag.view === '3d') {
      if (camDrag.button === 0) {
        orbit.theta -= dx * 0.006;
        orbit.phi = Math.min(Math.PI * 0.95, Math.max(0.05, orbit.phi - dy * 0.006));
        updateCam3d();
      } else {
        // pan: move the target in the camera plane
        const wpp = worldPerPixel3d(clientX, clientY);
        const right = new THREE.Vector3();
        cam3d.getWorldDirection(new THREE.Vector3());
        right.setFromMatrixColumn(cam3d.matrix, 0).normalize();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam3d.quaternion).normalize();
        orbit.target.addScaledVector(right, -dx * wpp);
        orbit.target.addScaledVector(up, dy * wpp);
        updateCam3d();
      }
    } else {
      // 2D pan
      const aspect = Math.max(0.1, (size.w * split) / Math.max(1, size.h));
      const halfH = plan.halfH / plan.zoom;
      const wppX = (2 * halfH * aspect) / Math.max(1, size.w * split);
      const wppY = (2 * halfH) / Math.max(1, size.h);
      // screen up is world -Z
      plan.cx += dx * wppX;
      plan.cz += dy * wppY;
      updateCam2d(aspect);
    }
  }

  function zoomAt(clientX, clientY, deltaY) {
    const view = viewAt(clientX);
    if (view === '3d') {
      orbit.radius = Math.min(900, Math.max(4, orbit.radius * Math.pow(1.0015, -deltaY)));
      updateCam3d();
    } else {
      plan.zoom = Math.min(64, Math.max(0.05, plan.zoom * Math.pow(1.0015, -deltaY)));
      const aspect = Math.max(0.1, (size.w * split) / Math.max(1, size.h));
      updateCam2d(aspect);
    }
  }

  function endCameraDrag() { camDrag.active = false; }

  // --- frame all ------------------------------------------------------------------------
  function frameAll(bounds) {
    if (!bounds) {
      orbit.target.set(0, 0, 0);
      orbit.radius = 90;
      updateCam3d();
      plan.cx = 0; plan.cz = 0; plan.zoom = 1;
      updateCam2d(Math.max(0.1, (size.w * split) / Math.max(1, size.h)));
      return;
    }
    const c = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const extent = Math.max(
      bounds.max[0] - bounds.min[0],
      bounds.max[2] - bounds.min[2],
      (bounds.max[1] - bounds.min[1]) * 2,
      24,
    );
    orbit.target.set(c[0], c[1], c[2]);
    orbit.radius = extent * 1.1 + 16;
    updateCam3d();
    plan.cx = c[0];
    plan.cz = c[2];
    plan.zoom = 1;
    plan.halfH = extent * 0.62 + 10;
    const aspect = Math.max(0.1, (size.w * split) / Math.max(1, size.h));
    updateCam2d(aspect);
  }

  function frameTop() {
    // straight down (plan orientation for the 3D view)
    orbit.theta = Math.PI * 0.25;
    orbit.phi = 0.02;
    updateCam3d();
  }

  function frameIso() {
    orbit.theta = Math.PI * 0.25;
    orbit.phi = Math.PI * 0.35;
    updateCam3d();
  }

  function frameFront() {
    orbit.theta = 0;
    orbit.phi = Math.PI * 0.02;
    updateCam3d();
  }

  // --- render loop -------------------------------------------------------------------------
  let running = true;
  function render() {
    if (!running) return;
    // keep gizmos at constant pixel size in their own view
    if (gizmo3d && gizmo3d.group.visible) gizmo3d.updateScale(cam3d, size.h);
    if (gizmo2d && gizmo2d.group.visible) gizmo2d.updateScale(cam2d, size.h);
    renderer.setScissorTest(true);
    // 2D view (left)
    renderer.setViewport(0, 0, Math.max(1, size.w * split), size.h);
    renderer.setScissor(0, 0, Math.max(1, size.w * split), size.h);
    renderer.render(scene, cam2d);
    // 3D view (right)
    renderer.setViewport(size.w * split, 0, Math.max(1, size.w * (1 - split)), size.h);
    renderer.setScissor(size.w * split, 0, Math.max(1, size.w * (1 - split)), size.h);
    renderer.render(scene, cam3d);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  function dispose() {
    running = false;
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    domElement: renderer.domElement,
    setSplit,
    getSplit: () => split,
    resize,
    setNetwork,
    setProject,
    setSceneSettings,
    setGizmo,
    pick,
    gizmoAt,
    rayFromClient,
    viewAt,
    projectToScreen,
    startCameraDrag,
    moveCameraDrag,
    endCameraDrag,
    zoomAt,
    frameAll,
    frameTop,
    frameIso,
    frameFront,
    cam3d,
    cam2d,
    scene,
    dispose,
  };
}
