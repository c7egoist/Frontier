import * as THREE from 'three';
import { terrainHeight, fbm } from '../util/noise.js';
import { groundTexture } from '../gfx/textures.js';

export function buildTerrain() {
  const SIZE = 900, SEG = 300;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const moss = new THREE.Color('#5d7a34'), dirt = new THREE.Color('#6e5a3a'), dark = new THREE.Color('#3a4a24');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    const n = fbm(x * 0.03, z * 0.03, 4, 3);
    const n2 = fbm(x * 0.2, z * 0.2, 2, 8);
    c.copy(dark).lerp(moss, Math.min(1, n * 1.6)).lerp(dirt, Math.max(0, (n2 - 0.55) * 1.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const tex = groundTexture();
  tex.repeat.set(130, 130);
  const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
