// Translate gizmo — visual + interaction port of Slate Frontier's
// Frontier/Engine/Editor/GizmoFigures.cpp (Translate mode).
//
// Figures (unit reach, group auto-scales to constant screen size):
//   3 cones on the axes (X red / Y green / Z blue), 3 translucent corner
//   quads with two opaque edges (YZ cyan / XZ magenta / XY yellow),
//   1 billboarded white ring (view-plane drag handle).
// Drag: axis / plane / camera-plane, Ctrl snaps to 0.25 (Blender rules).

import React, { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Point3D } from '../lib/model';
import {
  V3, alongAxisUnderRay, touchPlaneUnderRay, snapStep,
  GIZMO_SNAP, GIZMO_QUAD_OPACITY, GIZMO_QUAD_HOVER_OPACITY,
  GIZMO_TINT_X, GIZMO_TINT_Y, GIZMO_TINT_Z,
  GIZMO_TINT_YZ, GIZMO_TINT_XZ, GIZMO_TINT_XY,
} from '../lib/gizmoMath';

const TIP = 0.95;
const QUAD_C = TIP - 0.08; // (u+v) * QUAD_C
const QH = 0.08;

interface AxisDef {
  id: string;
  dir: V3;
  tint: string;
  quadTint: string;
  u: V3;
  v: V3;
}

const AXES: AxisDef[] = [
  { id: 'x', dir: [1, 0, 0], tint: GIZMO_TINT_X, quadTint: GIZMO_TINT_YZ, u: [0, 1, 0], v: [0, 0, 1] },
  { id: 'y', dir: [0, 1, 0], tint: GIZMO_TINT_Y, quadTint: GIZMO_TINT_XZ, u: [1, 0, 0], v: [0, 0, 1] },
  { id: 'z', dir: [0, 0, 1], tint: GIZMO_TINT_Z, quadTint: GIZMO_TINT_XY, u: [1, 0, 0], v: [0, 1, 0] },
];

interface DragState {
  kind: 'axis' | 'plane' | 'view';
  dir: V3; // axis dir or plane normal (world)
  grabParam: number;
  grabPoint: V3;
  emitted: V3; // total delta emitted so far (for snap re-emit)
}

interface SlateGizmoProps {
  position: Point3D;
  onDelta: (dx: number, dy: number, dz: number) => void;
  /** TIP distance from center in pixels (default 85). */
  pixelSize?: number;
}

const HIT_MAT = {
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
  depthTest: false,
} as const;

export function SlateGizmo({ position, onDelta, pixelSize = 85 }: SlateGizmoProps) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => (s as any).controls as { enabled: boolean } | undefined);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const drag = useRef<DragState | null>(null);
  const origin = useRef<V3>([0, 0, 0]);
  const [hot, setHot] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  // constant screen size + billboarded ring
  useFrame(({ camera: cam, size }) => {
    if (!group.current) return;
    const p = group.current.position;
    const dist = (cam as THREE.PerspectiveCamera).position.distanceTo(p);
    const persp = cam as THREE.PerspectiveCamera;
    const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2))) / Math.max(1, size.height);
    group.current.scale.setScalar(Math.max(1e-4, wpp * pixelSize));
    if (ring.current) ring.current.quaternion.copy(cam.quaternion);
  });

  // cursor feedback
  React.useEffect(() => {
    document.body.style.cursor = dragging ? 'grabbing' : hot ? 'grab' : 'auto';
    return () => { document.body.style.cursor = 'auto'; };
  }, [dragging, hot]);

  const castRay = (clientX: number, clientY: number): THREE.Ray => {
    const rect = gl.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    return raycaster.ray;
  };
  const rayV3 = (ray: THREE.Ray): { o: V3; d: V3 } => ({
    o: [ray.origin.x, ray.origin.y, ray.origin.z],
    d: [ray.direction.x, ray.direction.y, ray.direction.z],
  });

  const beginDrag = (e: any, kind: DragState['kind'], dir: V3, gripId: string) => {
    const btn = (e.nativeEvent as PointerEvent).button;
    if (btn !== 0 && btn !== undefined) return;
    e.stopPropagation();
    const { o, d } = rayV3(castRay(e.nativeEvent.clientX, e.nativeEvent.clientY));
    origin.current = [position[0], position[1], position[2]];
    if (kind === 'axis') {
      drag.current = { kind, dir, grabParam: alongAxisUnderRay(dir, origin.current, o, d), grabPoint: [0, 0, 0], emitted: [0, 0, 0] };
    } else {
      const n = kind === 'view'
        ? ((() => { const v = new THREE.Vector3(); camera.getWorldDirection(v); return [v.x, v.y, v.z] as V3; })())
        : dir;
      const touch = touchPlaneUnderRay(n, origin.current, o, d) ?? origin.current;
      drag.current = { kind, dir: n, grabParam: 0, grabPoint: touch, emitted: [0, 0, 0] };
    }
    setHot(gripId);
    setDragging(true);
    if (controls) controls.enabled = false;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd, { once: true });
    window.addEventListener('pointercancel', onDragEnd, { once: true });
  };

  const onDragMove = (e: PointerEvent) => {
    const st = drag.current;
    if (!st) return;
    const { o, d } = rayV3(castRay(e.clientX, e.clientY));
    const snap = e.ctrlKey ? GIZMO_SNAP : 0;
    let total: V3;
    if (st.kind === 'axis') {
      const p = alongAxisUnderRay(st.dir, origin.current, o, d);
      const t = snapStep(p - st.grabParam, snap);
      total = [st.dir[0] * t, st.dir[1] * t, st.dir[2] * t];
    } else {
      const touch = touchPlaneUnderRay(st.dir, origin.current, o, d);
      if (!touch) return;
      total = [
        snapStep(touch[0] - st.grabPoint[0], snap),
        snapStep(touch[1] - st.grabPoint[1], snap),
        snapStep(touch[2] - st.grabPoint[2], snap),
      ];
    }
    const dx = total[0] - st.emitted[0];
    const dy = total[1] - st.emitted[1];
    const dz = total[2] - st.emitted[2];
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      st.emitted = total;
      onDeltaRef.current(dx, dy, dz);
    }
  };

  const onDragEnd = () => {
    drag.current = null;
    setDragging(false);
    setHot(null);
    if (controls) controls.enabled = true;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointercancel', onDragEnd);
  };

  React.useEffect(() => () => {
    window.removeEventListener('pointermove', onDragMove);
    if (controls) controls.enabled = true;
  }, []);

  const stopUp = (e: any) => e.stopPropagation();

  return (
    <group ref={group} position={position}>
      {AXES.map((a) => (
        <AxisGrips
          key={a.id}
          axis={a}
          hot={hot}
          setHot={setHot}
          dragging={dragging}
          onAxisDown={(e) => beginDrag(e, 'axis', a.dir, `move-${a.id}`)}
          onPlaneDown={(e) => beginDrag(e, 'plane', a.dir, `plane-${a.id}`)}
          onUp={stopUp}
        />
      ))}
      {/* white billboard ring = view-plane handle */}
      <mesh ref={ring} renderOrder={999}>
        <torusGeometry args={[0.16, 0.008, 12, 48]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.95} />
      </mesh>
      <mesh
        renderOrder={999}
        onPointerDown={(e) => beginDrag(e, 'view', [0, 0, 0], 'view')}
        onPointerUp={stopUp}
        onPointerOver={(e) => { e.stopPropagation(); if (!dragging) setHot('view'); }}
        onPointerOut={() => { if (!dragging) setHot(null); }}
      >
        <sphereGeometry args={[0.24, 12, 12]} />
        <meshBasicMaterial {...HIT_MAT} />
      </mesh>
    </group>
  );
}

function AxisGrips({
  axis, hot, setHot, dragging, onAxisDown, onPlaneDown, onUp,
}: {
  axis: AxisDef;
  hot: string | null;
  setHot: (h: string | null) => void;
  dragging: boolean;
  onAxisDown: (e: any) => void;
  onPlaneDown: (e: any) => void;
  onUp: (e: any) => void;
}) {
  const { dir, u, v } = axis;
  const coneQuat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir)),
    [dir],
  );
  const quadQuat = useMemo(() => {
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...u), new THREE.Vector3(...v), new THREE.Vector3(...dir),
    );
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [u, v, dir]);
  const conePos: V3 = [dir[0] * TIP, dir[1] * TIP, dir[2] * TIP];
  const quadPos: V3 = [(u[0] + v[0]) * QUAD_C, (u[1] + v[1]) * QUAD_C, (u[2] + v[2]) * QUAD_C];
  const moveHot = hot === `move-${axis.id}`;
  const planeHot = hot === `plane-${axis.id}`;

  // quad edges: backU -> outer -> backV (two opaque segments)
  const edgeGeo = useMemo(() => {
    const q = new THREE.Vector3(...quadPos);
    const uu = new THREE.Vector3(...u);
    const vv = new THREE.Vector3(...v);
    const outer = q.clone().addScaledVector(uu, QH).addScaledVector(vv, QH);
    const backU = q.clone().addScaledVector(uu, -QH).addScaledVector(vv, QH);
    const backV = q.clone().addScaledVector(uu, QH).addScaledVector(vv, -QH);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      backU.x, backU.y, backU.z, outer.x, outer.y, outer.z,
      outer.x, outer.y, outer.z, backV.x, backV.y, backV.z,
    ]), 3));
    return g;
  }, [quadPos, u, v]);
  React.useEffect(() => () => edgeGeo.dispose(), [edgeGeo]);

  const hoverIn = (id: string) => (e: any) => { e.stopPropagation(); if (!dragging) setHot(id); };
  const hoverOut = () => { if (!dragging) setHot(null); };

  return (
    <group>
      {/* axis cone */}
      <mesh position={conePos} quaternion={coneQuat} renderOrder={999}>
        <coneGeometry args={[0.06, 0.18, 24]} />
        <meshStandardMaterial
          color={axis.tint} roughness={0.55} metalness={0}
          emissive={axis.tint} emissiveIntensity={moveHot ? 0.6 : 0}
          depthTest={false}
        />
      </mesh>
      {/* axis hit shaft */}
      <mesh
        position={[dir[0] * 0.5, dir[1] * 0.5, dir[2] * 0.5]}
        quaternion={coneQuat}
        renderOrder={999}
        onPointerDown={onAxisDown}
        onPointerUp={onUp}
        onPointerOver={hoverIn(`move-${axis.id}`)}
        onPointerOut={hoverOut}
      >
        <cylinderGeometry args={[0.11, 0.11, 1.15, 8]} />
        <meshBasicMaterial {...HIT_MAT} />
      </mesh>
      {/* corner quad */}
      <mesh position={quadPos} quaternion={quadQuat} renderOrder={998}>
        <planeGeometry args={[QH * 2, QH * 2]} />
        <meshBasicMaterial
          color={axis.quadTint} transparent
          opacity={planeHot ? GIZMO_QUAD_HOVER_OPACITY : GIZMO_QUAD_OPACITY}
          side={THREE.DoubleSide} depthTest={false}
        />
      </mesh>
      <lineSegments geometry={edgeGeo} renderOrder={999}>
        <lineBasicMaterial color={axis.quadTint} depthTest={false} />
      </lineSegments>
      {/* quad hit plate */}
      <mesh
        position={quadPos}
        quaternion={quadQuat}
        renderOrder={999}
        onPointerDown={onPlaneDown}
        onPointerUp={onUp}
        onPointerOver={hoverIn(`plane-${axis.id}`)}
        onPointerOut={hoverOut}
      >
        <planeGeometry args={[0.34, 0.34]} />
        <meshBasicMaterial {...HIT_MAT} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
