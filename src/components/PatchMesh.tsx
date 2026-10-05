import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { PatchSpec } from '../lib/roadGeometry';

/** Renders one generator patch (road space) into the world. */
export const PatchMesh = React.memo(function PatchMesh({ patch }: { patch: PatchSpec }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const rows = patch.grid.length;
    if (rows === 0) return geo;
    const cols = patch.grid[0].length;
    const vertices = new Float32Array(rows * cols * 3);
    let k = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const g = patch.grid[i][j];
        vertices[k++] = g[0];
        vertices[k++] = g[2];
        vertices[k++] = -g[1];
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = i * cols + (j + 1);
        const c = (i + 1) * cols + (j + 1);
        const d = (i + 1) * cols + j;
        idx.push(a, d, b, b, d, c);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }, [patch]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={patch.fill_color}
        transparent={patch.alpha < 1}
        opacity={patch.alpha}
        side={THREE.DoubleSide}
        roughness={0.85}
        metalness={0.05}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  );
});
