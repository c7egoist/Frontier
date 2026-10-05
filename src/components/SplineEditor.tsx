import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Line, TransformControls as DreiTransformControls } from '@react-three/drei';
import { RoadSpline, SplineNode } from './RoadNetwork';
import { Vec3 } from '../lib/geometry';

const TransformControls = DreiTransformControls as any;

type Mode = 'select' | 'draw' | 'bridge' | 'elevate';

function SplineCenterGizmo({ spline, onUpdate }: { spline: RoadSpline, onUpdate: (dx: number, dy: number, dz: number) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const center = useMemo(() => {
    let cx = 0, cy = 0, cz = 0;
    spline.nodes.forEach(n => { cx += n.position[0]; cy += n.position[1]; cz += n.position[2]; });
    const len = spline.nodes.length || 1;
    return new THREE.Vector3(cx / len, (cz / len) + 0.5, -cy / len);
  }, [spline.nodes]);

  const prevPos = useRef(center.clone());

  useEffect(() => {
    if (!isDragging && meshRef.current) {
      meshRef.current.position.copy(center);
      prevPos.current.copy(center);
    }
  }, [center, isDragging]);

  return (
    <>
      <mesh ref={meshRef} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <TransformControls
        object={meshRef}
        mode="translate"
        onDraggingChanged={(e: any) => setIsDragging(e.value)}
        onObjectChange={() => {
          if (meshRef.current) {
            const curr = meshRef.current.position;
            const dx = curr.x - prevPos.current.x;
            const dy = -(curr.z - prevPos.current.z);
            const dz = curr.y - prevPos.current.y;
            if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6 || Math.abs(dz) > 1e-6) {
              onUpdate(dx, dy, dz);
              prevPos.current.copy(curr);
            }
          }
        }}
      />
    </>
  );
}

function NodeMesh({ node, isSelected, isEndpoint, mode, onClick, onUpdate }: any) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const color = isSelected ? "#ffffff" : (mode === 'draw' && isEndpoint ? "#6aa9ff" : "#888888");

  useEffect(() => {
    if (!isDragging && meshRef.current && node.position) {
      meshRef.current.position.set(node.position[0], node.position[2], -node.position[1]);
    }
  }, [node.position, isDragging]);

  return (
    <>
      <mesh ref={meshRef} onPointerDown={onClick}>
        <sphereGeometry args={[isSelected ? 0.7 : 0.5, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      {isSelected && mode === 'select' && (
        <TransformControls
          object={meshRef}
          mode="translate"
          onDraggingChanged={(e: any) => setIsDragging(e.value)}
          onObjectChange={() => {
            if (meshRef.current) {
              const p = meshRef.current.position;
              onUpdate([p.x, -p.z, p.y] as Vec3);
            }
          }}
        />
      )}
    </>
  );
}

function HandleMesh({ pos, color, onUpdate, isSelected }: any) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging && meshRef.current) {
      meshRef.current.position.set(pos[0], pos[2], -pos[1]);
    }
  }, [pos, isDragging]);

  return (
    <>
      <mesh ref={meshRef} visible={isSelected}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      {isSelected && (
        <TransformControls
          object={meshRef}
          mode="translate"
          size={0.6}
          onDraggingChanged={(e: any) => setIsDragging(e.value)}
          onObjectChange={() => {
            if (meshRef.current) {
              const p = meshRef.current.position;
              onUpdate([p.x, -p.z, p.y] as Vec3);
            }
          }}
        />
      )}
    </>
  );
}

export function SplineEditor({
  splines,
  activeSplineId,
  selectedNodeId,
  mode,
  onNodeClick,
  onNodeUpdate,
  onSplineUpdate,
  onSplinePoints
}: {
  splines: RoadSpline[];
  activeSplineId: string | null;
  selectedNodeId: string | null;
  mode: Mode;
  onNodeClick: (e: any, splineId: string, nodeId: string, isEndpoint: boolean) => void;
  onNodeUpdate: (splineId: string, nodeId: string, updates: Partial<SplineNode>) => void;
  onSplineUpdate: (splineId: string, dx: number, dy: number, dz: number) => void;
  onSplinePoints: (points: Vec3[]) => Vec3[];
}) {
  return (
    <group>
      {splines.map(spline => {
        const points = useMemo(() => {
          if (spline.nodes.length < 2) return [];
          const curvePath = new THREE.CurvePath<THREE.Vector3>();
          for (let i = 0; i < spline.nodes.length - 1; i++) {
            const n1 = spline.nodes[i];
            const n2 = spline.nodes[i + 1];
            curvePath.add(new THREE.CubicBezierCurve3(
              new THREE.Vector3(n1.position[0], n1.position[2], -n1.position[1]),
              new THREE.Vector3(n1.handle2[0], n1.handle2[2], -n1.handle2[1]),
              new THREE.Vector3(n2.handle1[0], n2.handle1[2], -n2.handle1[1]),
              new THREE.Vector3(n2.position[0], n2.position[2], -n2.position[1])
            ));
          }
          if (spline.closed && spline.nodes.length > 2) {
            const n1 = spline.nodes[spline.nodes.length - 1];
            const n2 = spline.nodes[0];
            curvePath.add(new THREE.CubicBezierCurve3(
              new THREE.Vector3(n1.position[0], n1.position[2], -n1.position[1]),
              new THREE.Vector3(n1.handle2[0], n1.handle2[2], -n1.handle2[1]),
              new THREE.Vector3(n2.handle1[0], n2.handle1[2], -n2.handle1[1]),
              new THREE.Vector3(n2.position[0], n2.position[2], -n2.position[1])
            ));
          }
          return curvePath.getPoints(spline.nodes.length * 20);
        }, [spline.nodes, spline.closed]);

        const isActive = spline.id === activeSplineId;

        return (
          <group key={spline.id}>
            {points.length > 0 && (
              <Line
                points={points}
                color={isActive ? (spline.profile.isBridge ? "#6aa9ff" : "#ffffff") : "#555555"}
                lineWidth={isActive ? 3 : 1.5}
                transparent
                opacity={isActive ? 1 : 0.6}
              />
            )}
            {isActive && !selectedNodeId && mode === 'select' && (
              <SplineCenterGizmo spline={spline} onUpdate={(dx, dy, dz) => onSplineUpdate(spline.id, dx, dy, dz)} />
            )}
            {spline.nodes.map((node, index) => {
              const isSelected = node.id === selectedNodeId;
              const isEndpoint = index === 0 || index === spline.nodes.length - 1;
              const showHandles = isSelected;

              return (
                <group key={node.id}>
                  {showHandles && (
                    <>
                      <Line
                        points={[
                          new THREE.Vector3(node.position[0], node.position[2], -node.position[1]),
                          new THREE.Vector3(node.handle1[0], node.handle1[2], -node.handle1[1])
                        ]}
                        color="#4488ff"
                        lineWidth={1}
                        transparent
                        opacity={0.6}
                      />
                      <Line
                        points={[
                          new THREE.Vector3(node.position[0], node.position[2], -node.position[1]),
                          new THREE.Vector3(node.handle2[0], node.handle2[2], -node.handle2[1])
                        ]}
                        color="#ff4444"
                        lineWidth={1}
                        transparent
                        opacity={0.6}
                      />
                      <HandleMesh pos={node.handle1} color="#4488ff" onUpdate={(p: Vec3) => onNodeUpdate(spline.id, node.id, { handle1: p })} isSelected={isSelected} />
                      <HandleMesh pos={node.handle2} color="#ff4444" onUpdate={(p: Vec3) => onNodeUpdate(spline.id, node.id, { handle2: p })} isSelected={isSelected} />
                    </>
                  )}
                  <NodeMesh
                    node={node}
                    isSelected={isSelected}
                    isEndpoint={isEndpoint}
                    mode={mode}
                    onClick={(e: any) => onNodeClick(e, spline.id, node.id, isEndpoint)}
                    onUpdate={(p: Vec3) => {
                      const dx = p[0] - node.position[0];
                      const dy = p[1] - node.position[1];
                      const dz = p[2] - node.position[2];
                      onNodeUpdate(spline.id, node.id, {
                        position: p,
                        handle1: [node.handle1[0] + dx, node.handle1[1] + dy, node.handle1[2] + dz],
                        handle2: [node.handle2[0] + dx, node.handle2[1] + dy, node.handle2[2] + dz],
                      });
                    }}
                  />
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
