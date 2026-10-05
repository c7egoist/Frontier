import React, { useMemo } from 'react';
import * as THREE from 'three';
import { PatchSpec } from '../lib/geometry';

export function PatchMesh({ patch }: { patch: PatchSpec }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    const rows = patch.grid.length;
    if (rows === 0) return geo;
    const cols = patch.grid[0]?.length ?? 0;
    if (cols === 0) return geo;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const [x, y, z] = patch.grid[i][j];
        // Roadnet coords: X right, Y forward, Z up -> Three: X right, Y up, Z back
        vertices.push(x, z, -y);
        uvs.push(i / (rows - 1 || 1), j / (cols - 1 || 1));
      }
    }

    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = i * cols + (j + 1);
        const c = (i + 1) * cols + (j + 1);
        const d = (i + 1) * cols + j;
        // Preserve winding for up normal
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [patch]);

  const materialProps = useMemo(() => {
    switch (patch.type) {
      case 'road':
        return { color: patch.color, roughness: 0.85, metalness: 0.05 };
      case 'pave':
        return { color: patch.color, roughness: 0.9, metalness: 0.0 };
      case 'curb':
        return { color: patch.color, roughness: 0.8, metalness: 0.1 };
      case 'bridge':
        return { color: patch.color, roughness: 0.75, metalness: 0.15 };
      case 'deck':
        return { color: patch.color, roughness: 0.8, metalness: 0.1 };
      case 'rail':
        return { color: '#c0c0c0', roughness: 0.3, metalness: 0.7 };
      default:
        return { color: patch.color, roughness: 0.8, metalness: 0.1 };
    }
  }, [patch]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={materialProps.color}
        roughness={materialProps.roughness}
        metalness={materialProps.metalness}
        side={THREE.DoubleSide}
        transparent={patch.alpha < 1}
        opacity={patch.alpha}
      />
    </mesh>
  );
}

export function PillarMesh({ pos, height, radius }: { pos: [number, number, number], height: number, radius: number }) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(radius, radius * 1.15, height, 16);
    g.translate(0, -height / 2, 0);
    return g;
  }, [height, radius]);

  return (
    <mesh position={[pos[0], pos[2], -pos[1]]} geometry={geo}>
      <meshStandardMaterial color="#4a4a4a" roughness={0.7} metalness={0.1} />
    </mesh>
  );
}

export function PillarFooting({ pos, radius }: { pos: [number, number, number], radius: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(radius * 3, 0.5, radius * 3);
    return g;
  }, [radius]);

  return (
    <mesh position={[pos[0], 0.25, -pos[1]]} geometry={geo}>
      <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
    </mesh>
  );
}
