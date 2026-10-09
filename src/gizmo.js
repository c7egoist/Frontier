// ---------------------------------------------------------------------------
// gizmo.js — the Slate translate gizmo (three.js), ported figure-for-figure
// from Slate Frontier's GizmoFigures.cpp (translate mode):
//   3 cones on the axes (X red / Y green / Z blue), 3 translucent corner
//   quads with two opaque edges (YZ cyan / XZ magenta / XY yellow), and 1
//   billboarded white ring (view-plane drag handle).
// Drag: axis / plane / camera-plane; Ctrl snaps to 0.25 world units
// (Blender rules). The gizmo reports TOTAL deltas from drag start so the
// editor can position targets absolutely (and snap cleanly on release).
// ---------------------------------------------------------------------------

import * as THREE from '../vendor/three.module.min.js';
import {
  alongAxisUnderRay, touchPlaneUnderRay, snapStep,
  GIZMO_SNAP, GIZMO_TIP, GIZMO_QUAD_HALF,
  GIZMO_QUAD_OPACITY, GIZMO_QUAD_HOVER_OPACITY,
  GIZMO_TINT_X, GIZMO_TINT_Y, GIZMO_TINT_Z,
  GIZMO_TINT_YZ, GIZMO_TINT_XZ, GIZMO_TINT_XY,
} from './gizmoMath.js';

const TIP = GIZMO_TIP;
const QUAD_C = TIP - 0.08; // (u+v) * QUAD_C
const QH = GIZMO_QUAD_HALF;

const AXES = [
  { id: 'x', dir: [1, 0, 0], tint: GIZMO_TINT_X, quadTint: GIZMO_TINT_YZ, u: [0, 1, 0], v: [0, 0, 1] },
  { id: 'y', dir: [0, 1, 0], tint: GIZMO_TINT_Y, quadTint: GIZMO_TINT_XZ, u: [1, 0, 0], v: [0, 0, 1] },
  { id: 'z', dir: [0, 0, 1], tint: GIZMO_TINT_Z, quadTint: GIZMO_TINT_XY, u: [1, 0, 0], v: [0, 1, 0] },
];

const HIT_MAT = {
  transparent: true, opacity: 0, depthWrite: false, colorWrite: false, depthTest: false,
};

/**
 * @param onDeltaTotal (dx, dy, dz) => void  — total translation since grab
 * @param onInteract () => void               — fired on pointer-down (grab)
 * @param pixelSize  TIP distance from centre in pixels (default 85)
 */
export function createGizmo({ onDeltaTotal, onInteract, pixelSize = 85 }) {
  const group = new THREE.Group();
  group.name = 'slate-gizmo';
  group.renderOrder = 999;

  const hitMeshes = [];
  const hotMeshes = new Map(); // mesh -> base opacity (for hover highlight)
  let hot = null;

  const setHot = (id) => {
    if (hot === id) return;
    // restore previous highlight (opacity AND emissive)
    for (const [mesh, base] of hotMeshes) {
      mesh.material.opacity = base.opacity;
      if (mesh.material.emissive) mesh.material.emissiveIntensity = base.emissive;
    }
    hot = id;
    if (id) {
      for (const m of hitMeshes) {
        if (m.userData.gizmoPart === id) {
          // highlight the matching visible part: axis cone or quad
          const axisId = id.startsWith('move-') ? id.slice(5) : id.startsWith('plane-') ? id.slice(6) : null;
          if (axisId) {
            const isPlane = id.startsWith('plane-');
            const vis = group.getObjectByName(isPlane ? `quad-${axisId}` : `cone-${axisId}`);
            if (vis) {
              hotMeshes.set(vis, {
                opacity: vis.material.opacity,
                emissive: vis.material.emissive ? vis.material.emissiveIntensity : 0,
              });
              vis.material.opacity = isPlane ? GIZMO_QUAD_HOVER_OPACITY : 1;
              if (vis.material.emissive) vis.material.emissiveIntensity = 0.6;
            }
          }
        }
      }
    }
  };

  const addHit = (mesh, part) => {
    mesh.userData.gizmoPart = part;
    hitMeshes.push(mesh);
    group.add(mesh);
  };

  // --- axes: cone + hit shaft + corner quad + quad hit plate ---
  for (const axis of AXES) {
    const { dir, u, v } = axis;
    const coneQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir),
    );
    const quadQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...u), new THREE.Vector3(...v), new THREE.Vector3(...dir),
      ),
    );
    const conePos = new THREE.Vector3(dir[0] * TIP, dir[1] * TIP, dir[2] * TIP);
    const quadPos = new THREE.Vector3((u[0] + v[0]) * QUAD_C, (u[1] + v[1]) * QUAD_C, (u[2] + v[2]) * QUAD_C);

    // visible cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.18, 24),
      new THREE.MeshStandardMaterial({
        color: axis.tint, roughness: 0.55, metalness: 0,
        emissive: axis.tint, emissiveIntensity: 0, depthTest: false,
      }),
    );
    cone.name = `cone-${axis.id}`;
    cone.position.copy(conePos);
    cone.quaternion.copy(coneQuat);
    cone.renderOrder = 999;
    group.add(cone);

    // invisible hit shaft along the axis
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.15, 8), new THREE.MeshBasicMaterial(HIT_MAT));
    shaft.position.set(dir[0] * 0.5, dir[1] * 0.5, dir[2] * 0.5);
    shaft.quaternion.copy(coneQuat);
    shaft.renderOrder = 999;
    addHit(shaft, `move-${axis.id}`);

    // translucent corner quad
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(QH * 2, QH * 2),
      new THREE.MeshBasicMaterial({
        color: axis.quadTint, transparent: true,
        opacity: GIZMO_QUAD_OPACITY, side: THREE.DoubleSide, depthTest: false,
      }),
    );
    quad.name = `quad-${axis.id}`;
    quad.position.copy(quadPos);
    quad.quaternion.copy(quadQuat);
    quad.renderOrder = 998;
    group.add(quad);
    hotMeshes.set(quad, { opacity: GIZMO_QUAD_OPACITY, emissive: 0 });

    // two opaque edges on the quad
    const q = quadPos;
    const uu = new THREE.Vector3(...u);
    const vv = new THREE.Vector3(...v);
    const outer = q.clone().addScaledVector(uu, QH).addScaledVector(vv, QH);
    const backU = q.clone().addScaledVector(uu, -QH).addScaledVector(vv, QH);
    const backV = q.clone().addScaledVector(uu, QH).addScaledVector(vv, -QH);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      backU.x, backU.y, backU.z, outer.x, outer.y, outer.z,
      outer.x, outer.y, outer.z, backV.x, backV.y, backV.z,
    ]), 3));
    const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: axis.quadTint, depthTest: false }));
    edges.renderOrder = 999;
    group.add(edges);

    // invisible hit plate over the quad
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ ...HIT_MAT, side: THREE.DoubleSide }));
    plate.position.copy(quadPos);
    plate.quaternion.copy(quadQuat);
    plate.renderOrder = 999;
    addHit(plate, `plane-${axis.id}`);
  }

  // --- billboarded white ring = view-plane handle ---
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.008, 12, 48),
    new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.95 }),
  );
  ring.name = 'ring';
  ring.renderOrder = 999;
  group.add(ring);
  const ringHit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), new THREE.MeshBasicMaterial(HIT_MAT));
  ringHit.renderOrder = 999;
  addHit(ringHit, 'view');

  // --- drag state ---
  const state = {
    position: [0, 0, 0],
    drag: null, // { kind, dir, grabParam, grabPoint, cameraDir }
  };

  const api = {
    group,
    hitMeshes,

    setPosition(p) {
      state.position = [...p];
      group.position.set(p[0], p[1], p[2]);
    },
    getPosition() { return state.position; },
    setVisible(v) { group.visible = v; },
    setHot,

    /** Keep the gizmo at a constant pixel size for the given camera. */
    updateScale(camera, viewportHeight) {
      if (!group.visible) return;
      const dist = camera.position.distanceTo(group.position);
      let wpp;
      if (camera.isPerspectiveCamera) {
        wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, viewportHeight);
      } else {
        wpp = Math.abs(camera.top - camera.bottom) / Math.max(1, viewportHeight);
      }
      group.scale.setScalar(Math.max(1e-4, wpp * pixelSize));
      ring.quaternion.copy(camera.quaternion);
    },

    /** Raycast the grips; returns the grip id ('move-x' | 'plane-y' | 'view') or null. */
    pick(raycaster) {
      const hits = raycaster.intersectObjects(hitMeshes, false);
      return hits.length > 0 ? hits[0].object.userData.gizmoPart : null;
    },

    /** Begin a drag. ray = THREE.Ray, camera = active camera, client = {x,y}. */
    beginDrag(part, ray, camera) {
      const o = [ray.origin.x, ray.origin.y, ray.origin.z];
      const d = [ray.direction.x, ray.direction.y, ray.direction.z];
      const origin = state.position;
      if (part.startsWith('move-')) {
        const dir = AXES.find((a) => a.id === part.slice(5)).dir;
        state.drag = {
          kind: 'axis', dir,
          grabParam: alongAxisUnderRay(dir, origin, o, d),
          grabPoint: null,
          cameraDir: null,
        };
      } else {
        let n;
        if (part === 'view') {
          const v = new THREE.Vector3();
          camera.getWorldDirection(v);
          n = [v.x, v.y, v.z];
        } else {
          n = AXES.find((a) => a.id === part.slice(6)).dir;
        }
        const touch = touchPlaneUnderRay(n, origin, o, d) ?? origin;
        state.drag = { kind: 'plane', dir: n, grabParam: 0, grabPoint: touch, cameraDir: n };
      }
      setHot(part);
      onInteract && onInteract();
      return true;
    },

    /** Move the drag; returns the total delta or null. */
    dragMove(ray, ctrlKey) {
      const st = state.drag;
      if (!st) return null;
      const o = [ray.origin.x, ray.origin.y, ray.origin.z];
      const d = [ray.direction.x, ray.direction.y, ray.direction.z];
      const origin = state.position;
      const snap = ctrlKey ? GIZMO_SNAP : 0;
      let total;
      if (st.kind === 'axis') {
        const p = alongAxisUnderRay(st.dir, origin, o, d);
        const t = snapStep(p - st.grabParam, snap);
        total = [st.dir[0] * t, st.dir[1] * t, st.dir[2] * t];
      } else {
        const touch = touchPlaneUnderRay(st.dir, origin, o, d);
        if (!touch) return null;
        total = [
          snapStep(touch[0] - st.grabPoint[0], snap),
          snapStep(touch[1] - st.grabPoint[1], snap),
          snapStep(touch[2] - st.grabPoint[2], snap),
        ];
      }
      return total;
    },

    endDrag() {
      state.drag = null;
      setHot(null);
    },

    isDragging() { return !!state.drag; },
  };
  return api;
}
