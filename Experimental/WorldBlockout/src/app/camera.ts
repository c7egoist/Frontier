// Orbit / fly camera for a 10,000 km world. Handles both scales without losing precision by
// keeping the eye as world-metre doubles and building the matrices in double precision.

import {
  DEG, mat4LookAt, mat4Mul, mat4Perspective, mat4Invert, clamp, type Vec3, type Mat4,
} from '../core/math.ts';

export class OrbitCamera {
  /** Target point on the water plane. */
  target: [number, number] = [0, 0];
  /** Distance from target along the orbit. */
  distance = 9000;
  /** Polar angle from the horizon (radians). 0 = level, PI/2 = straight down. */
  pitch = 26 * DEG;
  /** Yaw around the target. */
  yaw = 40 * DEG;
  /** Extra height offset applied above the terrain. */
  lift = 0;
  fovY = 55 * DEG;
  near = 1;
  far = 400_000;

  get eye(): Vec3 {
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp;
    const dz = Math.cos(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    return [this.target[0] + dx * this.distance, dy * this.distance + this.lift, this.target[1] + dz * this.distance];
  }

  get forward(): Vec3 {
    const e = this.eye;
    const dir: Vec3 = [this.target[0] - e[0], 0 - e[1], this.target[1] - e[2]];
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return [dir[0] / l, dir[1] / l, dir[2] / l];
  }

  orbit(dxPx: number, dyPx: number) {
    this.yaw -= dxPx * 0.005;
    this.pitch = clamp(this.pitch + dyPx * 0.004, -25 * DEG, 89.5 * DEG);
    this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  /** Zoom with distance-proportional step so orbit and ground scale behave the same. */
  zoom(delta: number) {
    const factor = Math.pow(1.0016, delta);
    this.distance = clamp(this.distance * factor, 12, 260_000);
  }

  pan(dxPx: number, dyPx: number, viewportHeight: number) {
    // World metres per pixel at the target plane.
    const worldPerPx = (2 * this.distance * Math.tan(this.fovY / 2)) / Math.max(viewportHeight, 1);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const rightX = c, rightZ = -s;
    const fwdX = -s, fwdZ = -c;
    this.target[0] -= (dxPx * rightX + dyPx * fwdX * 0.6) * worldPerPx;
    this.target[1] -= (dxPx * rightZ + dyPx * fwdZ * 0.6) * worldPerPx;
  }

  matrix(aspect: number): { view: Mat4; proj: Mat4; viewProj: Mat4; invViewProj: Mat4; eye: Vec3 } {
    const eye = this.eye;
    const view = mat4LookAt(eye, [this.target[0], 0, this.target[1]], [0, 1, 0]);
    const proj = mat4Perspective(this.fovY, aspect, this.near, this.far);
    const viewProj = mat4Mul(proj, view);
    return { view, proj, viewProj, invViewProj: mat4Invert(viewProj), eye };
  }

  /** Screen ray in world space, used for picking brush positions. */
  ray(ndcX: number, ndcY: number, aspect: number): { origin: Vec3; dir: Vec3 } {
    const m = this.matrix(aspect);
    const inv = m.invViewProj;
    const p: Vec3 = [0, 0, 0];
    const unproject = (z: number): Vec3 => {
      const x = inv[0] * ndcX + inv[4] * ndcY + inv[8] * z + inv[12];
      const y = inv[1] * ndcX + inv[5] * ndcY + inv[9] * z + inv[13];
      const zz = inv[2] * ndcX + inv[6] * ndcY + inv[10] * z + inv[14];
      const w = inv[3] * ndcX + inv[7] * ndcY + inv[11] * z + inv[15];
      return [x / w, y / w, zz / w];
    };
    const near = unproject(0);
    const far = unproject(1);
    p[0] = far[0] - near[0];
    p[1] = far[1] - near[1];
    p[2] = far[2] - near[2];
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    return { origin: near, dir: [p[0] / l, p[1] / l, p[2] / l] };
  }
}
