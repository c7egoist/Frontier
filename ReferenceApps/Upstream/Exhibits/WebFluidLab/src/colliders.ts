import type { ColliderSpec } from "./types.ts";

// The tank is an open-top glass box. World space is meters, +Y up.
export const TANK_HALF_EXTENT: [number, number, number] = [2.1, 2.4, 1.5];
export const TANK_FLOOR_Y = 0;

export function defaultColliders(): ColliderSpec[] {
  return [
    {
      kind: "sphere",
      position: [-0.7, 0.55, 0.3],
      size: [0.55, 0.55, 0.55],
      rotationY: 0,
      spinSpeed: 0,
      color: [0.75, 0.78, 0.82],
    },
    {
      kind: "box",
      position: [0.85, 0.4, -0.35],
      size: [0.4, 0.4, 0.4],
      rotationY: 0.4,
      spinSpeed: 0.3,
      color: [0.65, 0.5, 0.35],
    },
    {
      kind: "paddle",
      position: [0.1, 1.1, 0.0],
      size: [0.95, 0.09, 0.22],
      rotationY: 0,
      spinSpeed: 0.8,
      color: [0.82, 0.82, 0.86],
    },
  ];
}

/** Signed distance (negative inside) from a point to a collider, plus outward normal. Used by the CPU solver. */
export function colliderSdf(
  c: ColliderSpec,
  px: number,
  py: number,
  pz: number,
  time: number,
): { dist: number; nx: number; ny: number; nz: number } {
  switch (c.kind) {
    case "sphere": {
      const dx = px - c.position[0];
      const dy = py - c.position[1];
      const dz = pz - c.position[2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const r = c.size[0];
      return { dist: d - r, nx: dx / d, ny: dy / d, nz: dz / d };
    }
    case "box": {
      const yaw = c.rotationY + (c.spinSpeed !== 0 ? c.spinSpeed * time : 0);
      const cs = Math.cos(-yaw);
      const sn = Math.sin(-yaw);
      const lx0 = px - c.position[0];
      const lz0 = pz - c.position[2];
      const lx = lx0 * cs - lz0 * sn;
      const lz = lx0 * sn + lz0 * cs;
      const ly = py - c.position[1];
      const qx = Math.abs(lx) - c.size[0];
      const qy = Math.abs(ly) - c.size[1];
      const qz = Math.abs(lz) - c.size[2];
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const oz = Math.max(qz, 0);
      const outside = Math.hypot(ox, oy, oz);
      const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
      const dist = outside + inside;
      // Approximate gradient via local-space axis push, rotated back to world.
      let gx = qx > qy && qx > qz ? Math.sign(lx) : 0;
      let gy = qy > qx && qy > qz ? Math.sign(ly) : 0;
      let gz = qz > qx && qz > qy ? Math.sign(lz) : 0;
      if (gx === 0 && gy === 0 && gz === 0) gx = Math.sign(lx) || 1;
      const wx = gx * cs + gz * sn;
      const wz = -gx * sn + gz * cs;
      return { dist, nx: wx, ny: gy, nz: wz };
    }
    case "paddle": {
      // Rotating flat paddle approximated as a thin box swept around the Y axis.
      const ang = c.spinSpeed * time;
      const cs = Math.cos(-ang);
      const sn = Math.sin(-ang);
      const lx0 = px - c.position[0];
      const lz0 = pz - c.position[2];
      const lx = lx0 * cs - lz0 * sn;
      const lz = lx0 * sn + lz0 * cs;
      const ly = py - c.position[1];
      const qx = Math.abs(lx) - c.size[0];
      const qy = Math.abs(ly) - c.size[1];
      const qz = Math.abs(lz) - c.size[2];
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const oz = Math.max(qz, 0);
      const outside = Math.hypot(ox, oy, oz);
      const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
      const dist = outside + inside;
      let gy = qy >= qx && qy >= qz ? Math.sign(ly) || 1 : 0;
      let gx = !gy && qx > qz ? Math.sign(lx) : 0;
      let gz = !gy && qz >= qx ? Math.sign(lz) : 0;
      const wx = gx * cs + gz * sn;
      const wz = -gx * sn + gz * cs;
      return { dist, nx: wx, ny: gy, nz: wz };
    }
    case "plane":
    default: {
      return { dist: py - TANK_FLOOR_Y, nx: 0, ny: 1, nz: 0 };
    }
  }
}

/** Packs collider specs into a flat Float32Array for upload as a GPU uniform/storage buffer. */
export const COLLIDER_STRIDE_FLOATS = 12;

export function packColliders(colliders: ColliderSpec[]): Float32Array {
  const out = new Float32Array(colliders.length * COLLIDER_STRIDE_FLOATS);
  const kindCode: Record<string, number> = { plane: 0, sphere: 1, box: 2, paddle: 3 };
  colliders.forEach((c, i) => {
    const base = i * COLLIDER_STRIDE_FLOATS;
    out[base + 0] = c.position[0];
    out[base + 1] = c.position[1];
    out[base + 2] = c.position[2];
    out[base + 3] = kindCode[c.kind] ?? 0;
    out[base + 4] = c.size[0];
    out[base + 5] = c.size[1];
    out[base + 6] = c.size[2];
    out[base + 7] = c.rotationY;
    out[base + 8] = c.spinSpeed;
    out[base + 9] = c.color[0];
    out[base + 10] = c.color[1];
    out[base + 11] = c.color[2];
  });
  return out;
}
