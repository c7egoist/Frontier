import { mat4, vec3 } from "gl-matrix";
import type { OrbitCamera } from "./OrbitCamera.ts";

/**
 * Packs camera matrices + basis vectors into the 88-float layout shared by
 * the WebGPU `Camera` uniform struct (see renderCommon.wgsl) and the
 * equivalent WebGL2 uniform set.
 */
export function buildCameraUniform(cam: OrbitCamera, aspect: number, proj: mat4, time: number): Float32Array {
  const view = cam.viewMatrix();
  const viewProj = mat4.create();
  mat4.multiply(viewProj, proj, view);
  const invViewProj = mat4.create();
  mat4.invert(invViewProj, viewProj);

  const eye = cam.eye;
  const forward = vec3.create();
  vec3.subtract(forward, cam.target, eye);
  vec3.normalize(forward, forward);
  const worldUp = vec3.fromValues(0, 1, 0);
  const right = vec3.create();
  vec3.cross(right, forward, worldUp);
  vec3.normalize(right, right);
  const up = vec3.create();
  vec3.cross(up, right, forward);
  vec3.normalize(up, up);

  const lightDir = vec3.fromValues(0.45, 0.82, 0.3);
  vec3.normalize(lightDir, lightDir);

  const out = new Float32Array(88);
  out.set(viewProj, 0);
  out.set(invViewProj, 16);
  out.set(view, 32);
  out.set(proj, 48);
  out.set([eye[0], eye[1], eye[2], 0], 64);
  out.set([right[0], right[1], right[2], 0], 68);
  out.set([up[0], up[1], up[2], 0], 72);
  out.set([forward[0], forward[1], forward[2], 0], 76);
  out.set([lightDir[0], lightDir[1], lightDir[2], 0], 80);
  out.set([time, aspect, 0.05, 60], 84);
  return out;
}

export const CAMERA_UNIFORM_FLOATS = 88;
