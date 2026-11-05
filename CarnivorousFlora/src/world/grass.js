import * as THREE from 'three';
import { Rng, terrainHeightGLSL, windGLSL } from '../util/noise.js';
import { Shared } from '../gfx/shaderPatches.js';

/**
 * GPU grass. Blades live on a torus-wrapped grid that follows the camera, so density stays high
 * around the player without ever re-uploading data. Height comes from the same analytic terrain
 * function as the mesh (see noise.js).
 */
export function buildGrass({ count = 160000, size = 100 } = {}) {
  const blade = new THREE.BufferGeometry();
  const pos = [], nor = [], idx = [];
  const levels = [0, 0.38, 0.72, 1.0];
  levels.forEach((t, i) => {
    const w = i === levels.length - 1 ? 0 : 1 - t * 0.85;
    if (w === 0) { pos.push(0, t, 0); nor.push(0, 1, 0); }
    else { pos.push(-w, t, 0, w, t, 0); nor.push(0, 1, 0, 0, 1, 0); }
  });
  // two quads + tip triangle
  idx.push(0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6);
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  blade.setIndex(idx);

  const g = new THREE.InstancedBufferGeometry();
  g.index = blade.index;
  g.setAttribute('position', blade.attributes.position);
  g.setAttribute('normal', blade.attributes.normal);
  const rng = new Rng(77);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = rng.next(); data[i * 4 + 1] = rng.next(); data[i * 4 + 2] = rng.next(); data[i * 4 + 3] = rng.next();
  }
  g.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
  g.instanceCount = count;

  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uPush: { value: new THREE.Vector3(0, -999, 0) },
    uSize: { value: size },
  };
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uTime: Shared.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aData; uniform vec3 uCam; uniform vec3 uPush; uniform float uSize; uniform float uTime;
        varying float vH; varying float vRand;
        ${terrainHeightGLSL}
        ${windGLSL}`)
      .replace('#include <begin_vertex>', `
        vec2 b = aData.xy * uSize;
        vec2 wp = uCam.xz + mod(b - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
        float gh = terrainH(wp);
        float dist = length(wp - uCam.xz);
        float fade = 1.0 - smoothstep(uSize * 0.34, uSize * 0.5, dist);
        float hh = (0.45 + aData.z * aData.z * 1.15) * fade;
        float ang = aData.w * 6.28318;
        vec2 dir = vec2(cos(ang), sin(ang));
        float t = position.y;
        float w = position.x * (0.034 + 0.02 * aData.z) * fade;
        vec2 xz = wp + vec2(-dir.y, dir.x) * w;
        float wind = windValue(wp, uTime);
        float bend = t * t;
        xz += vec2(0.8, 0.6) * wind * 0.2 * bend * hh;
        xz += dir * 0.22 * bend * hh * aData.z;
        vec2 away = wp - uPush.xz;
        float pd = length(away);
        float push = smoothstep(1.8, 0.0, pd) * step(abs(uPush.y - gh), 6.0);
        xz += normalize(away + vec2(1e-4)) * push * 0.55 * bend * hh;
        vec3 transformed = vec3(xz.x, gh + t * hh * (1.0 - 0.2 * push) - 0.04, xz.y);
        vH = t; vRand = aData.z;`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(0.0, 1.0, 0.0);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH; varying float vRand;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gBase = vec3(0.07, 0.14, 0.04);
        vec3 gMid = mix(vec3(0.20, 0.34, 0.08), vec3(0.28, 0.38, 0.09), vRand);
        vec3 gTip = mix(vec3(0.55, 0.72, 0.26), vec3(0.78, 0.74, 0.34), pow(vRand, 3.0));
        vec3 gc = mix(gBase, gMid, smoothstep(0.0, 0.5, vH));
        gc = mix(gc, gTip, smoothstep(0.45, 1.0, vH) * (0.6 + 0.4 * vRand));
        diffuseColor.rgb *= gc;`);
  };
  mat.customProgramCacheKey = () => 'grass';
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
