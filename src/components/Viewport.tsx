import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  MousePointer2, PenTool, Hand, LayoutGrid, Focus, Box, ArrowDownToLine, Square,
} from 'lucide-react';
import type { Mode, Project, Selection, Spline, SplineNode, Point3D } from '../lib/model';
import type { BuiltNetwork } from '../lib/network';
import { PatchMesh } from './PatchMesh';
import { SlateGizmo } from './SlateGizmo';

export type ViewPreset = 'iso' | 'top' | 'front' | 'frame';
export interface ViewRequest { preset: ViewPreset; nonce: number }
export interface FrameBounds { min: Point3D; max: Point3D }

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

function CameraRig({ request, bounds }: { request: ViewRequest; bounds: FrameBounds | null }) {
  const { camera, controls } = useThree() as any;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const cam = camera as THREE.PerspectiveCamera;
    const set = (pos: [number, number, number], tgt: [number, number, number]) => {
      cam.position.set(pos[0], pos[1], pos[2]);
      if (controls) {
        controls.target.set(tgt[0], tgt[1], tgt[2]);
        controls.update();
      }
    };
    if (request.preset === 'iso') set([0, 55, 55], [0, 0, 0]);
    else if (request.preset === 'top') set([0, 120, 0.01], [0, 0, 0]);
    else if (request.preset === 'front') set([0, 25, 120], [0, 5, 0]);
    else if (request.preset === 'frame') {
      if (!bounds) { set([0, 55, 55], [0, 0, 0]); return; }
      const c: [number, number, number] = [
        (bounds.min[0] + bounds.max[0]) / 2,
        (bounds.min[1] + bounds.max[1]) / 2,
        (bounds.min[2] + bounds.max[2]) / 2,
      ];
      const size = Math.max(
        bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2],
        (bounds.max[1] - bounds.min[1]) * 2, 20,
      );
      const dir = new THREE.Vector3(0, 55, 55).normalize();
      const dist = size * 1.15 + 18;
      set([c[0] + dir.x * dist, c[1] + dir.y * dist, c[2] + dir.z * dist], c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  return null;
}

// ---------------------------------------------------------------------------
// spline editing
// ---------------------------------------------------------------------------

function SplineCenterGizmo({
  spline, onUpdate, onInteract,
}: {
  spline: Spline;
  onUpdate: (dx: number, dy: number, dz: number) => void;
  onInteract: () => void;
}) {
  const center = useMemo<Point3D>(() => {
    let cx = 0; let cy = 0; let cz = 0;
    spline.nodes.forEach((n) => { cx += n.position[0]; cy += n.position[1]; cz += n.position[2]; });
    const len = Math.max(1, spline.nodes.length);
    return [cx / len, cy / len + 0.5, cz / len];
  }, [spline.nodes]);
  return <SlateGizmo position={center} onDelta={onUpdate} onInteract={onInteract} />;
}

function DraggableHandle({
  pos, color, onUpdate, onInteract,
}: {
  pos: Point3D; color: string; onUpdate: (p: Point3D) => void; onInteract: () => void;
}) {
  const [selected, setSelected] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  return (
    <>
      <mesh position={pos} scale={hover || selected ? 1.35 : 1}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
        <meshBasicMaterial color={selected ? '#ffffff' : color} />
      </mesh>
      <mesh
        position={pos}
        onPointerDown={(e) => { e.stopPropagation(); onInteract(); setSelected(true); }}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
        onPointerOut={() => setHover(false)}
      >
        <sphereGeometry args={[0.55, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {selected && (
        <SlateGizmo
          position={pos}
          pixelSize={70}
          onInteract={onInteract}
          onDelta={(dx, dy, dz) => onUpdate([pos[0] + dx, pos[1] + dy, pos[2] + dz])}
        />
      )}
    </>
  );
}

function NodeMesh({
  node, splineId, splineColor, isSelected, isEndpoint, mode, onNodeClick, onNodeUpdate, onInteract,
}: {
  node: SplineNode;
  splineId: string;
  splineColor: string;
  isSelected: boolean;
  isEndpoint: boolean;
  mode: Mode;
  onNodeClick: (splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
  onInteract: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  const color = isSelected ? '#ffffff' : mode === 'draw' && isEndpoint ? '#7fc97f' : splineColor;

  return (
    <>
      <mesh position={node.position} scale={isSelected || hover ? 1.3 : 1}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {isSelected && (
        <mesh position={node.position}>
          <octahedronGeometry args={[0.46, 0]} />
          <meshBasicMaterial color={splineColor} wireframe transparent opacity={0.9} />
        </mesh>
      )}
      <mesh
        position={node.position}
        onPointerDown={(e) => {
          if ((e.nativeEvent as PointerEvent).button !== 0) return;
          e.stopPropagation();
          onInteract();
          onNodeClick(splineId, node.id, isEndpoint);
        }}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[0.75, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {isSelected && mode === 'select' && (
        <SlateGizmo
          position={node.position}
          onInteract={onInteract}
          onDelta={(dx, dy, dz) => onNodeUpdate(splineId, node.id, {
            position: [node.position[0] + dx, node.position[1] + dy, node.position[2] + dz],
            handleIn: [node.handleIn[0] + dx, node.handleIn[1] + dy, node.handleIn[2] + dz],
            handleOut: [node.handleOut[0] + dx, node.handleOut[1] + dy, node.handleOut[2] + dz],
          })}
        />
      )}
    </>
  );
}

function SplineRenderer({
  spline, isActive, selectedNodeId, mode, onNodeClick, onNodeUpdate, onSplineUpdate, onInteract,
}: {
  spline: Spline;
  isActive: boolean;
  selectedNodeId: string | null;
  mode: Mode;
  onNodeClick: (splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
  onSplineUpdate: (splineId: string, dx: number, dy: number, dz: number) => void;
  onInteract: () => void;
}) {
  const points = useMemo(() => {
    if (spline.nodes.length < 2) return [];
    const path = new THREE.CurvePath<THREE.Vector3>();
    const span = (a: SplineNode, b: SplineNode) => {
      path.add(new THREE.CubicBezierCurve3(
        new THREE.Vector3(...a.position),
        new THREE.Vector3(...a.handleOut),
        new THREE.Vector3(...b.handleIn),
        new THREE.Vector3(...b.position),
      ));
    };
    for (let i = 0; i < spline.nodes.length - 1; i++) span(spline.nodes[i], spline.nodes[i + 1]);
    if (spline.closed && spline.nodes.length > 2) span(spline.nodes[spline.nodes.length - 1], spline.nodes[0]);
    return path.getPoints(spline.nodes.length * 24);
  }, [spline.nodes, spline.closed]);

  if (!spline.visible) return null;

  return (
    <group>
      {points.length > 0 && (
        <Line
          points={points}
          color={spline.color}
          transparent
          opacity={isActive ? 0.95 : 0.45}
          lineWidth={isActive ? 2 : 1.25}
          depthTest={!isActive}
        />
      )}
      {isActive && !selectedNodeId && mode === 'select' && spline.nodes.length > 0 && (
        <SplineCenterGizmo
          spline={spline}
          onInteract={onInteract}
          onUpdate={(dx, dy, dz) => onSplineUpdate(spline.id, dx, dy, dz)}
        />
      )}
      {spline.nodes.map((node, index) => {
        const isEndpoint = !spline.closed && (index === 0 || index === spline.nodes.length - 1);
        const isSel = node.id === selectedNodeId;
        return (
          <group key={node.id}>
            {isSel && isActive && mode === 'select' && (
              <>
                <Line points={[node.position, node.handleIn]} color="#7fb2e8" lineWidth={1} transparent opacity={0.55} />
                <Line points={[node.position, node.handleOut]} color="#e88a7f" lineWidth={1} transparent opacity={0.55} />
                <DraggableHandle
                  pos={node.handleIn}
                  color="#7fb2e8"
                  onInteract={onInteract}
                  onUpdate={(p) => onNodeUpdate(spline.id, node.id, { handleIn: p })}
                />
                <DraggableHandle
                  pos={node.handleOut}
                  color="#e88a7f"
                  onInteract={onInteract}
                  onUpdate={(p) => onNodeUpdate(spline.id, node.id, { handleOut: p })}
                />
              </>
            )}
            <NodeMesh
              node={node}
              splineId={spline.id}
              splineColor={spline.color}
              isSelected={isSel}
              isEndpoint={isEndpoint}
              mode={mode}
              onNodeClick={onNodeClick}
              onNodeUpdate={onNodeUpdate}
              onInteract={onInteract}
            />
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// viewport
// ---------------------------------------------------------------------------

export interface ViewportProps {
  project: Project;
  network: BuiltNetwork;
  mode: Mode;
  selection: Selection;
  activeSplineId: string | null;
  viewRequest: ViewRequest;
  frameBounds: FrameBounds | null;
  onModeChange: (m: Mode) => void;
  onSelect: (s: Selection) => void;
  onGroundPointerDown: (e: any) => void;
  onGroundClick: () => void;
  onNodePointerDown: (splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
  onSplineUpdate: (splineId: string, dx: number, dy: number, dz: number) => void;
  onToggleGrid: () => void;
  onViewPreset: (p: ViewPreset) => void;
  onDrawHeight: (h: number) => void;
  onPointerUp: () => void;
}

const MODE_DOT: Record<Mode, string> = { select: '#b9b9b9', draw: '#d6a665', pan: '#717171' };
const MODE_HINT: Record<Mode, React.ReactNode> = {
  select: (<span><b>Click</b> node · <b>drag</b> gizmo, snaps to roads · <b>Right-drag</b> pan · <kbd>Del</kbd> node</span>),
  draw: (<span><b>Click</b> ground to extend · <b>Click</b> a road to join it · <kbd>Esc</kbd> finish</span>),
  pan: (<span><b>Left-drag</b> pan · <b>Right-drag</b> orbit · <b>Wheel</b> zoom</span>),
};

export function Viewport(props: ViewportProps) {
  const { project, network, mode, selection, activeSplineId, viewRequest, frameBounds } = props;
  const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null;
  const splineById = useMemo(() => new Map(project.splines.map((s) => [s.id, s])), [project.splines]);
  const visibleSpans = network.spans.filter((sp) => splineById.get(sp.splineId)?.visible !== false);
  const visibleJunctions = network.junctions.filter((j) =>
    j.arms.some((a) => splineById.get(a.splineId)?.visible !== false),
  );

  // --- DOM-level selection manager ---
  // R3F click/pointer-missed semantics proved non-deterministic (drags ending
  // over the ground plane fired "click" and cleared selection). Instead: every
  // 3D interactive marks `handled` on pointer-down; the DOM wrapper deselects
  // only on a clean button-0 press+release on the bare canvas. Selection set
  // on pointer-down can never be undone by the release that follows it.
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const handled = useRef(false);
  const markHandled = useCallback(() => { handled.current = true; }, []);
  const onWrapDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
    downPos.current = { x: e.clientX, y: e.clientY };
    handled.current = false;
  };
  const onWrapUp = (e: React.PointerEvent) => {
    props.onPointerUp();
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).tagName !== 'CANVAS') { downPos.current = null; return; }
    const d0 = downPos.current;
    downPos.current = null;
    if (!d0 || handled.current) return;
    if (Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 6) props.onGroundClick();
  };

  const selSplineId = selection.kind === 'spline' || selection.kind === 'node' ? selection.splineId : null;

  return (
    <div className="rw-viewport" onPointerDownCapture={onWrapDown} onPointerUp={onWrapUp}>
      <Canvas camera={{ position: [0, 55, 55], fov: 50, near: 0.5, far: 1500 }} dpr={[1, 2]}>
        <color attach="background" args={['#0b0b0b']} />
        <fog attach="fog" args={['#0b0b0b', 160, 520]} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#3d3d3d', '#0a0a0a', 0.5]} />
        <directionalLight position={[30, 50, 20]} intensity={1.6} />
        <directionalLight position={[-20, 30, -30]} intensity={0.5} />
        <CameraRig request={viewRequest} bounds={frameBounds} />

        {project.scene.showGrid && (
          <Grid
            position={[0, project.scene.groundZ + 0.02, 0]}
            infiniteGrid
            fadeDistance={220}
            sectionSize={10}
            cellSize={2}
            sectionColor="#3a3a3a"
            cellColor="#1e1e1e"
          />
        )}
        {project.scene.showGround && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, project.scene.groundZ, 0]}>
            <circleGeometry args={[420, 64]} />
            <meshStandardMaterial color="#121212" roughness={1} metalness={0} />
          </mesh>
        )}
        {project.scene.showWater && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, project.scene.waterLevel, 0]}>
            <circleGeometry args={[420, 64]} />
            <meshStandardMaterial color="#17333d" roughness={0.35} metalness={0.1} transparent opacity={0.88} />
          </mesh>
        )}

        {/* click plane at draw height — marks handled only while drawing */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, project.scene.drawHeight, 0]}
          onPointerDown={(e) => {
            if (mode !== 'draw') return;
            if ((e.nativeEvent as PointerEvent).button !== 0) return;
            e.stopPropagation();
            markHandled();
            props.onGroundPointerDown(e);
          }}
        >
          <planeGeometry args={[2000, 2000]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        {project.splines.map((s) => (
          <SplineRenderer
            key={s.id}
            spline={s}
            mode={mode}
            isActive={s.id === activeSplineId}
            selectedNodeId={s.id === selSplineId ? selectedNodeId : null}
            onNodeClick={props.onNodePointerDown}
            onNodeUpdate={props.onNodeUpdate}
            onSplineUpdate={props.onSplineUpdate}
            onInteract={markHandled}
          />
        ))}

        {visibleSpans.map((sp, i) => (
          <group key={`span-${i}`}>
            {sp.patches.map((p, j) => (
              <PatchMesh key={j} patch={p} />
            ))}
          </group>
        ))}
        {visibleJunctions.map((j) => (
          <group key={j.id}>
            {j.patches.map((p, k) => (
              <PatchMesh key={k} patch={p} />
            ))}
            <mesh
              position={[j.position[0], j.position[1] + 1, j.position[2]]}
              onPointerDown={(e) => {
                if ((e.nativeEvent as PointerEvent).button !== 0) return;
                e.stopPropagation();
                markHandled();
                props.onSelect({ kind: 'junction', junctionId: j.id });
              }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
              <sphereGeometry args={[3.2, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>
            <Html position={[j.position[0], j.position[1], j.position[2]]} center style={{ pointerEvents: 'none' }}>
              <div className="rw-junction-tag">
                <small>JUNCTION</small>
                {j.topology}
              </div>
            </Html>
          </group>
        ))}

        <OrbitControls
          makeDefault
          enabled={mode !== 'draw'}
          enableDamping
          dampingFactor={0.1}
          maxPolarAngle={Math.PI / 2 - 0.02}
          mouseButtons={
            mode === 'pan'
              ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
              : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
          }
        />
      </Canvas>

      {/* overlays */}
      <div className="rw-viewtools">
        <button title="Select (V)" className={mode === 'select' ? 'active' : ''} onClick={() => props.onModeChange('select')}>
          <MousePointer2 size={14} /> Select
        </button>
        <button title="Draw (P)" className={mode === 'draw' ? 'active' : ''} onClick={() => props.onModeChange('draw')}>
          <PenTool size={14} /> Draw
        </button>
        <button title="Pan (H)" className={mode === 'pan' ? 'active' : ''} onClick={() => props.onModeChange('pan')}>
          <Hand size={14} /> Pan
        </button>
        <div className="vt-sep" />
        <button title="Toggle grid (G)" className={project.scene.showGrid ? 'active' : ''} onClick={props.onToggleGrid}>
          <LayoutGrid size={14} /> Grid
        </button>
        <div className="vt-sep" />
        <button title="Isometric (1)" onClick={() => props.onViewPreset('iso')}>
          <Box size={14} /> Iso
        </button>
        <button title="Top (2)" onClick={() => props.onViewPreset('top')}>
          <ArrowDownToLine size={14} /> Top
        </button>
        <button title="Front (3)" onClick={() => props.onViewPreset('front')}>
          <Square size={14} /> Front
        </button>
        <button title="Frame all (F)" onClick={() => props.onViewPreset('frame')}>
          <Focus size={14} /> Frame
        </button>
        {mode === 'draw' && (
          <>
            <div className="vt-sep" />
            <span className="vt-label">Height</span>
            <input
              type="number"
              step={0.5}
              value={project.scene.drawHeight}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) props.onDrawHeight(v);
              }}
            />
          </>
        )}
      </div>

      <div className="rw-caption-tag">
        <b>{project.name}</b> · {project.splines.length} splines · <span className="amber">{network.junctions.length} junctions</span>
      </div>

      <div className="rw-hintbar">
        <span className="mode-dot" style={{ background: MODE_DOT[mode] }} />
        {MODE_HINT[mode]}
      </div>
    </div>
  );
}
