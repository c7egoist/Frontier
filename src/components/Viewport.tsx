import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls, Line, Grid, TransformControls as DreiTransformControls, Html,
} from '@react-three/drei';
import * as THREE from 'three';
import { MousePointer2, PenTool, Hand, LayoutGrid, Focus } from 'lucide-react';
import type { Mode, Project, Selection, Spline, SplineNode, Point3D } from '../lib/model';
import type { BuiltNetwork } from '../lib/network';
import { PatchMesh } from './PatchMesh';

const TransformControls = DreiTransformControls as any;

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
  const meshRef = useRef<THREE.Mesh>(null);
  const center = useMemo(() => {
    let cx = 0; let cy = 0; let cz = 0;
    spline.nodes.forEach((n) => { cx += n.position[0]; cy += n.position[1]; cz += n.position[2]; });
    const len = Math.max(1, spline.nodes.length);
    return new THREE.Vector3(cx / len, cy / len, cz / len);
  }, [spline.nodes]);
  const prevPos = useRef(center.clone());
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging && meshRef.current) {
      meshRef.current.position.copy(center);
      prevPos.current.copy(center);
    }
  }, [center, dragging]);

  return (
    <>
      <mesh ref={meshRef} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <TransformControls
        object={meshRef}
        mode="translate"
        onMouseDown={() => setDragging(true)}
        onMouseUp={() => setDragging(false)}
        onObjectChange={() => {
          if (meshRef.current) {
            const curr = meshRef.current.position;
            const dx = curr.x - prevPos.current.x;
            const dy = curr.y - prevPos.current.y;
            const dz = curr.z - prevPos.current.z;
            if (dx !== 0 || dy !== 0 || dz !== 0) {
              onUpdate(dx, dy, dz);
              prevPos.current.copy(curr);
            }
          }
        }}
      />
    </>
  );
}

function DraggableHandle({
  pos, color, onUpdate,
}: {
  pos: Point3D; color: string; onUpdate: (p: Point3D) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if (!dragging && meshRef.current) meshRef.current.position.set(pos[0], pos[1], pos[2]);
  }, [pos, dragging]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  return (
    <>
      <mesh
        ref={meshRef}
        onPointerDown={(e) => { e.stopPropagation(); setSelected(true); }}
        onPointerMissed={() => setSelected(false)}
      >
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshBasicMaterial color={selected ? '#ffffff' : color} depthTest={false} />
      </mesh>
      {selected && (
        <TransformControls
          object={meshRef}
          mode="translate"
          size={0.55}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onObjectChange={() => {
            if (meshRef.current) {
              onUpdate([meshRef.current.position.x, meshRef.current.position.y, meshRef.current.position.z]);
            }
          }}
        />
      )}
    </>
  );
}

function NodeMesh({
  node, splineId, isSelected, isEndpoint, mode, onNodeClick, onNodeUpdate,
}: {
  node: SplineNode;
  splineId: string;
  isSelected: boolean;
  isEndpoint: boolean;
  mode: Mode;
  onNodeClick: (e: any, splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [dragging, setDragging] = useState(false);
  const color = isSelected ? '#ffffff' : mode === 'draw' && isEndpoint ? '#7fc97f' : '#9a9a9a';

  useEffect(() => {
    if (!dragging && meshRef.current) {
      meshRef.current.position.set(node.position[0], node.position[1], node.position[2]);
    }
  }, [node.position, dragging]);

  return (
    <>
      <mesh ref={meshRef} onPointerDown={(e) => onNodeClick(e, splineId, node.id, isEndpoint)}>
        <sphereGeometry args={[isSelected ? 0.7 : 0.55, 14, 14]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      {isSelected && mode === 'select' && (
        <TransformControls
          object={meshRef}
          mode="translate"
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onObjectChange={() => {
            if (!meshRef.current || !dragging) return;
            const p: Point3D = [meshRef.current.position.x, meshRef.current.position.y, meshRef.current.position.z];
            const dx = p[0] - node.position[0];
            const dy = p[1] - node.position[1];
            const dz = p[2] - node.position[2];
            onNodeUpdate(splineId, node.id, {
              position: p,
              handleIn: [node.handleIn[0] + dx, node.handleIn[1] + dy, node.handleIn[2] + dz],
              handleOut: [node.handleOut[0] + dx, node.handleOut[1] + dy, node.handleOut[2] + dz],
            });
          }}
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
  const showHandles = isActive && mode === 'select';

  return (
    <group>
      {points.length > 0 && (
        <Line
          points={points}
          color={isActive ? '#f2f2f2' : spline.color}
          transparent
          opacity={isActive ? 1 : 0.55}
          lineWidth={isActive ? 3 : 1.5}
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
        return (
          <group key={node.id}>
            {showHandles && (
              <>
                <Line points={[node.position, node.handleIn]} color="#7fb2e8" lineWidth={1.5} transparent opacity={0.8} />
                <Line points={[node.position, node.handleOut]} color="#e88a7f" lineWidth={1.5} transparent opacity={0.8} />
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
              isSelected={node.id === selectedNodeId}
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
        <Canvas camera={{ position: [0, 55, 55], fov: 50 }} dpr={[1, 2]}>
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
            onClick={props.onGroundClick}
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
            <span><b>Drag</b> nodes &amp; handles · <b>Right-drag</b> pan · <kbd>Del</kbd> node</span>
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
