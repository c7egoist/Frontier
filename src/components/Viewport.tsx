import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import { MousePointer2, PenTool, Hand, LayoutGrid, Focus } from 'lucide-react';
import type { Mode, Project, Selection, Spline, SplineNode, Point3D } from '../lib/model';
import type { BuiltNetwork } from '../lib/network';
import { PatchMesh } from './PatchMesh';
import { SlateGizmo } from './SlateGizmo';

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

function CameraRig({ nonce }: { nonce: number }) {
  const { camera, controls } = useThree() as any;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    camera.position.set(0, 55, 55);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [nonce]);
  return null;
}

// ---------------------------------------------------------------------------
// spline editing
// ---------------------------------------------------------------------------

function SplineCenterGizmo({ spline, onUpdate }: { spline: Spline; onUpdate: (dx: number, dy: number, dz: number) => void }) {
  const center = useMemo<Point3D>(() => {
    let cx = 0; let cy = 0; let cz = 0;
    spline.nodes.forEach((n) => { cx += n.position[0]; cy += n.position[1]; cz += n.position[2]; });
    const len = Math.max(1, spline.nodes.length);
    return [cx / len, cy / len + 0.5, cz / len];
  }, [spline.nodes]);
  return <SlateGizmo position={center} onDelta={onUpdate} />;
}

function DraggableHandle({
  pos, color, onUpdate,
}: {
  pos: Point3D; color: string; onUpdate: (p: Point3D) => void;
}) {
  const [selected, setSelected] = useState(false);
  const [hover, setHover] = useState(false);

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
        onPointerDown={(e) => { e.stopPropagation(); setSelected(true); }}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMissed={() => setSelected(false)}
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
          onDelta={(dx, dy, dz) => onUpdate([pos[0] + dx, pos[1] + dy, pos[2] + dz])}
        />
      )}
    </>
  );
}

function NodeMesh({
  node, splineId, splineColor, isSelected, isEndpoint, mode, onNodeClick, onNodeUpdate,
}: {
  node: SplineNode;
  splineId: string;
  splineColor: string;
  isSelected: boolean;
  isEndpoint: boolean;
  mode: Mode;
  onNodeClick: (e: any, splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
}) {
  const [hover, setHover] = useState(false);
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
        onPointerDown={(e) => onNodeClick(e, splineId, node.id, isEndpoint)}
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
  spline, isActive, selectedNodeId, mode, onNodeClick, onNodeUpdate, onSplineUpdate,
}: {
  spline: Spline;
  isActive: boolean;
  selectedNodeId: string | null;
  mode: Mode;
  onNodeClick: (e: any, splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
  onSplineUpdate: (splineId: string, dx: number, dy: number, dz: number) => void;
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
                  onUpdate={(p) => onNodeUpdate(spline.id, node.id, { handleIn: p })}
                />
                <DraggableHandle
                  pos={node.handleOut}
                  color="#e88a7f"
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
  viewNonce: number;
  stats: { tris: number; patches: number };
  onModeChange: (m: Mode) => void;
  onSelect: (s: Selection) => void;
  onGroundPointerDown: (e: any) => void;
  onGroundClick: () => void;
  onNodePointerDown: (e: any, splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
  onSplineUpdate: (splineId: string, dx: number, dy: number, dz: number) => void;
  onToggleGrid: () => void;
  onFrameAll: () => void;
  onDrawHeight: (h: number) => void;
}

const MODE_DOT: Record<Mode, string> = { select: '#b9b9b9', draw: '#7fc97f', pan: '#717171' };

export function Viewport(props: ViewportProps) {
  const {
    project, network, mode, selection, activeSplineId, viewNonce, stats,
  } = props;
  const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null;
  const splineById = useMemo(() => new Map(project.splines.map((s) => [s.id, s])), [project.splines]);
  const visibleSpans = network.spans.filter((sp) => splineById.get(sp.splineId)?.visible !== false);
  const visibleJunctions = network.junctions.filter((j) =>
    j.arms.some((a) => splineById.get(a.splineId)?.visible !== false),
  );

  return (
    <div className="viewport">
      <div className="viewport-top">
        <div>
          Viewport
          <span>/</span>
          <span>{project.splines.length} splines · {network.junctions.length} junctions</span>
        </div>
        <div style={{ color: '#717171', fontSize: 10 }}>
          {stats.patches} patches · {(stats.tris / 1000).toFixed(1)}k tris
        </div>
      </div>
      <div className="canvas-wrap">
        <Canvas camera={{ position: [0, 55, 55], fov: 50, near: 0.5, far: 1500 }} dpr={[1, 2]}>
          <color attach="background" args={['#0b0b0b']} />
          <fog attach="fog" args={['#0b0b0b', 160, 520]} />
          <ambientLight intensity={0.55} />
          <hemisphereLight args={['#3d3d3d', '#0a0a0a', 0.5]} />
          <directionalLight position={[30, 50, 20]} intensity={1.6} />
          <directionalLight position={[-20, 30, -30]} intensity={0.5} />
          <CameraRig nonce={viewNonce} />

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

          {/* click plane at draw height */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, project.scene.drawHeight, 0]}
            onPointerDown={props.onGroundPointerDown}
            onClick={(e) => { if (e.delta < 5) props.onGroundClick(); }}
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
              selectedNodeId={s.id === (selection.kind === 'node' || selection.kind === 'spline' ? (selection as any).splineId : null) ? selectedNodeId : null}
              onNodeClick={props.onNodePointerDown}
              onNodeUpdate={props.onNodeUpdate}
              onSplineUpdate={props.onSplineUpdate}
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
                onClick={(e) => { e.stopPropagation(); props.onSelect({ kind: 'junction', junctionId: j.id }); }}
                onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
              >
                <sphereGeometry args={[3.2, 8, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
              </mesh>
              <Html position={[j.position[0], j.position[1], j.position[2]]} center style={{ pointerEvents: 'none', transform: 'translate3d(0,-30px,0)' }}>
                <div className="junction-tag">
                  <small>Junction</small>
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
        <div className="mode-pill">
          <span className="dot" style={{ background: MODE_DOT[mode] }} />
          <span>{mode} mode</span>
        </div>

        <div className="tool-rail">
          <button title="Select (V)" className={mode === 'select' ? 'active' : ''} onClick={() => props.onModeChange('select')}>
            <MousePointer2 size={18} />
          </button>
          <button title="Draw (P)" className={mode === 'draw' ? 'active' : ''} onClick={() => props.onModeChange('draw')}>
            <PenTool size={18} />
          </button>
          <button title="Pan (H)" className={mode === 'pan' ? 'active' : ''} onClick={() => props.onModeChange('pan')}>
            <Hand size={18} />
          </button>
          <div className="rail-sep" />
          <button title="Toggle grid (G)" className={project.scene.showGrid ? 'active' : ''} onClick={props.onToggleGrid}>
            <LayoutGrid size={18} />
          </button>
          <button title="Frame all (F)" onClick={props.onFrameAll}>
            <Focus size={18} />
          </button>
        </div>

        {mode === 'draw' && (
          <div className="draw-height">
            <label>Height</label>
            <input
              type="number"
              step={0.5}
              value={project.scene.drawHeight}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) props.onDrawHeight(v);
              }}
            />
          </div>
        )}

        <div className="hud bottom-left">
          {mode === 'select' && (
            <span><b>Click</b> node · <b>drag</b> gizmo (Ctrl = snap) · <b>Right-drag</b> pan · <kbd>Del</kbd> node</span>
          )}
          {mode === 'draw' && (
            <span><b>Click</b> ground to extend · <b>Click</b> a node to join · <kbd>Esc</kbd> finish</span>
          )}
          {mode === 'pan' && (
            <span><b>Left-drag</b> pan · <b>Right-drag</b> orbit · <b>Wheel</b> zoom</span>
          )}
        </div>
        <div className="hud bottom-right">
          <span>{visibleSpans.length} spans · {visibleJunctions.length} junctions</span>
        </div>
      </div>
    </div>
  );
}
