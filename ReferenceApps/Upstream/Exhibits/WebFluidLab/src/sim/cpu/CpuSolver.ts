import { DOMAIN_MAX, DOMAIN_MIN, GRAVITY, SMOOTHING_RADIUS } from "../common.ts";
import { MATERIAL_ORDER, MATERIAL_PRESETS, materialIndex } from "../../materials.ts";
import { colliderSdf } from "../../colliders.ts";
import type { ColliderSpec, MaterialId } from "../../types.ts";

const H = SMOOTHING_RADIUS;
const H2 = H * H;
const PARTICLE_VOLUME = 0.0017;
const TAIT_GAMMA = 7;

function poly6(r2: number, h: number): number {
  if (r2 > h * h) return 0;
  const diff = h * h - r2;
  const k = 315 / (64 * Math.PI * Math.pow(h, 9));
  return k * diff * diff * diff;
}

function spikyGradScale(r: number, h: number): number {
  if (r <= 1e-5 || r > h) return 0;
  const k = -45 / (Math.PI * Math.pow(h, 6));
  const diff = h - r;
  return k * diff * diff;
}

function viscLap(r: number, h: number): number {
  if (r > h) return 0;
  const k = 45 / (Math.PI * Math.pow(h, 6));
  return k * (h - r);
}

function cohesionKernel(r: number, h: number): number {
  if (r > h || r <= 1e-4) return 0;
  return (1 - r / h) * (h - r);
}

/**
 * CPU, single-threaded WCSPH fluid solver used as the WebGL2 fallback when
 * WebGPU compute is unavailable. Mirrors the physics model of GpuSolver at a
 * reduced particle budget so materials, collisions and adhesion all behave
 * consistently between backends.
 */
export class CpuSolver {
  readonly maxParticles: number;
  posX: Float32Array;
  posY: Float32Array;
  posZ: Float32Array;
  velX: Float32Array;
  velY: Float32Array;
  velZ: Float32Array;
  accelX: Float32Array;
  accelY: Float32Array;
  accelZ: Float32Array;
  dens: Float32Array;
  matIdx: Float32Array;
  contact: Float32Array;

  activeCount = 0;
  private spawnCursor = 0;
  private colliders: ColliderSpec[] = [];
  simTime = 0;

  private grid = new Map<number, number[]>();
  private gridNx: number;
  private gridNy: number;
  private gridNz: number;

  constructor(maxParticles: number) {
    this.maxParticles = maxParticles;
    this.posX = new Float32Array(maxParticles);
    this.posY = new Float32Array(maxParticles);
    this.posZ = new Float32Array(maxParticles);
    this.velX = new Float32Array(maxParticles);
    this.velY = new Float32Array(maxParticles);
    this.velZ = new Float32Array(maxParticles);
    this.accelX = new Float32Array(maxParticles);
    this.accelY = new Float32Array(maxParticles);
    this.accelZ = new Float32Array(maxParticles);
    this.dens = new Float32Array(maxParticles).fill(1);
    this.matIdx = new Float32Array(maxParticles);
    this.contact = new Float32Array(maxParticles);

    this.gridNx = Math.max(1, Math.ceil((DOMAIN_MAX[0] - DOMAIN_MIN[0]) / H));
    this.gridNy = Math.max(1, Math.ceil((DOMAIN_MAX[1] - DOMAIN_MIN[1]) / H));
    this.gridNz = Math.max(1, Math.ceil((DOMAIN_MAX[2] - DOMAIN_MIN[2]) / H));
  }

  setColliders(colliders: ColliderSpec[]) {
    this.colliders = colliders;
  }

  setActiveBudget(budget: number) {
    this.activeCount = Math.min(this.activeCount, budget);
  }

  reset() {
    this.activeCount = 0;
    this.spawnCursor = 0;
    this.simTime = 0;
  }

  spawn(req: { material: MaterialId; origin: [number, number, number]; spread: number; count: number; initialVelocity: [number, number, number] }, budget: number) {
    const clampedBudget = Math.max(1, Math.min(this.maxParticles, Math.floor(budget)));
    this.spawnCursor = this.spawnCursor % clampedBudget;
    const matIdx = materialIndex(req.material);
    for (let n = 0; n < req.count; n++) {
      const i = this.spawnCursor;
      this.posX[i] = req.origin[0] + (Math.random() * 2 - 1) * req.spread;
      this.posY[i] = req.origin[1] + Math.random() * req.spread * 0.4;
      this.posZ[i] = req.origin[2] + (Math.random() * 2 - 1) * req.spread;
      this.velX[i] = req.initialVelocity[0] + (Math.random() - 0.5) * 0.2;
      this.velY[i] = req.initialVelocity[1];
      this.velZ[i] = req.initialVelocity[2] + (Math.random() - 0.5) * 0.2;
      this.accelX[i] = 0;
      this.accelY[i] = 0;
      this.accelZ[i] = 0;
      this.dens[i] = 1;
      this.matIdx[i] = matIdx;
      this.contact[i] = 0;
      this.spawnCursor = (this.spawnCursor + 1) % clampedBudget;
      this.activeCount = Math.min(clampedBudget, this.activeCount + 1);
    }
  }

  private cellKey(cx: number, cy: number, cz: number): number {
    return cx + cy * this.gridNx + cz * this.gridNx * this.gridNy;
  }

  private cellCoord(x: number, y: number, z: number): [number, number, number] {
    const cx = Math.min(this.gridNx - 1, Math.max(0, Math.floor((x - DOMAIN_MIN[0]) / H)));
    const cy = Math.min(this.gridNy - 1, Math.max(0, Math.floor((y - DOMAIN_MIN[1]) / H)));
    const cz = Math.min(this.gridNz - 1, Math.max(0, Math.floor((z - DOMAIN_MIN[2]) / H)));
    return [cx, cy, cz];
  }

  private buildGrid() {
    this.grid.clear();
    const n = this.activeCount;
    for (let i = 0; i < n; i++) {
      const [cx, cy, cz] = this.cellCoord(this.posX[i], this.posY[i], this.posZ[i]);
      const key = this.cellKey(cx, cy, cz);
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = [];
        this.grid.set(key, bucket);
      }
      bucket.push(i);
    }
  }

  private forEachNeighbor(x: number, y: number, z: number, fn: (j: number) => void) {
    const [cx, cy, cz] = this.cellCoord(x, y, z);
    for (let dz = -1; dz <= 1; dz++) {
      const nz = cz + dz;
      if (nz < 0 || nz >= this.gridNz) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= this.gridNy) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= this.gridNx) continue;
          const bucket = this.grid.get(this.cellKey(nx, ny, nz));
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) fn(bucket[k]);
        }
      }
    }
  }

  step(dt: number, substeps: number) {
    if (this.activeCount === 0) return;
    const subDt = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      this.simTime += subDt;
      this.buildGrid();
      this.computeDensity();
      this.computeForces();
      this.integrate(subDt);
    }
  }

  private computeDensity() {
    const n = this.activeCount;
    for (let i = 0; i < n; i++) {
      const xi = this.posX[i];
      const yi = this.posY[i];
      const zi = this.posZ[i];
      let density = 0;
      this.forEachNeighbor(xi, yi, zi, (j) => {
        const dx = xi - this.posX[j];
        const dy = yi - this.posY[j];
        const dz = zi - this.posZ[j];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < H2) {
          const mat = MATERIAL_PRESETS[MATERIAL_ORDER[this.matIdx[j]]];
          density += mat.restDensity * PARTICLE_VOLUME * poly6(r2, H);
        }
      });
      this.dens[i] = Math.max(density, 1);
    }
  }

  private computeForces() {
    const n = this.activeCount;
    for (let i = 0; i < n; i++) {
      const xi = this.posX[i];
      const yi = this.posY[i];
      const zi = this.posZ[i];
      const matI = MATERIAL_PRESETS[MATERIAL_ORDER[this.matIdx[i]]];
      const densI = this.dens[i];
      const ratioI = densI / matI.restDensity;
      const pressI = Math.max(matI.stiffness * (Math.pow(ratioI, TAIT_GAMMA) - 1), 0);

      let fx = 0,
        fy = 0,
        fz = 0;
      this.forEachNeighbor(xi, yi, zi, (j) => {
        if (j === i) return;
        const dx = xi - this.posX[j];
        const dy = yi - this.posY[j];
        const dz = zi - this.posZ[j];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 >= H2 || r2 <= 1e-10) return;
        const r = Math.sqrt(r2);
        const matJ = MATERIAL_PRESETS[MATERIAL_ORDER[this.matIdx[j]]];
        const massJ = matJ.restDensity * PARTICLE_VOLUME;
        const densJ = this.dens[j];
        const ratioJ = densJ / matJ.restDensity;
        const pressJ = Math.max(matJ.stiffness * (Math.pow(ratioJ, TAIT_GAMMA) - 1), 0);

        const gradScale = spikyGradScale(r, H);
        const invR = 1 / r;
        const gx = dx * invR * gradScale;
        const gy = dy * invR * gradScale;
        const gz = dz * invR * gradScale;
        const pTerm = -massJ * (pressI / (densI * densI) + pressJ / (densJ * densJ));
        fx += pTerm * gx;
        fy += pTerm * gy;
        fz += pTerm * gz;

        const relVX = this.velX[j] - this.velX[i];
        const relVY = this.velY[j] - this.velY[i];
        const relVZ = this.velZ[j] - this.velZ[i];
        const viscCoeff = (matI.viscosity + matJ.viscosity) * 0.5;
        const vlap = viscLap(r, H);
        fx += (viscCoeff * massJ * relVX * vlap) / densJ;
        fy += (viscCoeff * massJ * relVY * vlap) / densJ;
        fz += (viscCoeff * massJ * relVZ * vlap) / densJ;

        const cohCoeff = (matI.cohesion + matJ.cohesion) * 0.5;
        const ck = cohesionKernel(r, H);
        fx += -cohCoeff * massJ * dx * invR * ck;
        fy += -cohCoeff * massJ * dy * invR * ck;
        fz += -cohCoeff * massJ * dz * invR * ck;
      });

      fy += GRAVITY;
      const mag = Math.hypot(fx, fy, fz);
      const maxAccel = 70;
      if (mag > maxAccel) {
        const s = maxAccel / mag;
        fx *= s;
        fy *= s;
        fz *= s;
      }
      this.accelX[i] = fx;
      this.accelY[i] = fy;
      this.accelZ[i] = fz;
    }
  }

  private resolveContact(
    i: number,
    pos: [number, number, number],
    vel: [number, number, number],
    dist: number,
    nx: number,
    ny: number,
    nz: number,
    radius: number,
    friction: number,
    adhesion: number,
    dt: number,
  ) {
    const pen = radius - dist;
    if (pen > 0) {
      pos[0] += nx * pen;
      pos[1] += ny * pen;
      pos[2] += nz * pen;
      const vn = vel[0] * nx + vel[1] * ny + vel[2] * nz;
      if (vn < 0) {
        vel[0] -= nx * vn;
        vel[1] -= ny * vn;
        vel[2] -= nz * vn;
      }
      const stick = Math.min(0.97, Math.max(0, adhesion * 1.4));
      const damp = (1 - friction) * (1 - stick * 0.6);
      vel[0] *= damp;
      vel[1] *= damp;
      vel[2] *= damp;
      this.contact[i] = Math.max(this.contact[i], Math.min(1, Math.max(0, adhesion)));
    } else if (dist < radius * 3.5 && adhesion > 0.05) {
      const pull = adhesion * (1 - dist / (radius * 3.5));
      vel[0] -= nx * pull * 2.4 * dt;
      vel[1] -= ny * pull * 2.4 * dt;
      vel[2] -= nz * pull * 2.4 * dt;
      this.contact[i] = Math.max(this.contact[i], pull * 0.5);
    }
  }

  private integrate(dt: number) {
    const n = this.activeCount;
    const pos: [number, number, number] = [0, 0, 0];
    const vel: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const mat = MATERIAL_PRESETS[MATERIAL_ORDER[this.matIdx[i]]];
      let vx = this.velX[i] + this.accelX[i] * dt;
      let vy = this.velY[i] + this.accelY[i] * dt;
      let vz = this.velZ[i] + this.accelZ[i] * dt;
      const dampScale = Math.exp(-mat.damping * 9.0 * dt);
      vx *= dampScale;
      vy *= dampScale;
      vz *= dampScale;
      let px = this.posX[i] + vx * dt;
      let py = this.posY[i] + vy * dt;
      let pz = this.posZ[i] + vz * dt;

      this.contact[i] = 0;
      pos[0] = px;
      pos[1] = py;
      pos[2] = pz;
      vel[0] = vx;
      vel[1] = vy;
      vel[2] = vz;

      const radius = mat.particleRadius;
      this.resolveContact(i, pos, vel, pos[1] - DOMAIN_MIN[1], 0, 1, 0, radius, mat.friction, mat.adhesion, dt);
      this.resolveContact(i, pos, vel, DOMAIN_MAX[0] - pos[0], -1, 0, 0, radius, mat.friction, mat.adhesion, dt);
      this.resolveContact(i, pos, vel, pos[0] - DOMAIN_MIN[0], 1, 0, 0, radius, mat.friction, mat.adhesion, dt);
      this.resolveContact(i, pos, vel, DOMAIN_MAX[2] - pos[2], 0, 0, -1, radius, mat.friction, mat.adhesion, dt);
      this.resolveContact(i, pos, vel, pos[2] - DOMAIN_MIN[2], 0, 0, 1, radius, mat.friction, mat.adhesion, dt);

      for (const c of this.colliders) {
        const hit = colliderSdf(c, pos[0], pos[1], pos[2], this.simTime);
        this.resolveContact(i, pos, vel, hit.dist, hit.nx, hit.ny, hit.nz, radius, mat.friction, mat.adhesion, dt);
      }

      // Bingham-plastic-style yield behaviour: thick materials (mud,
      // chocolate) have a yield speed below which residual SPH jitter gets
      // strongly braked instead of persisting forever.
      const yieldSpeed = mat.damping * 0.9;
      const restSpeed = Math.hypot(vel[0], vel[1], vel[2]);
      if (yieldSpeed > 0.001 && restSpeed < yieldSpeed) {
        const t = Math.min(1, Math.max(0, restSpeed / yieldSpeed));
        const brake = 0.015 + (1 - 0.015) * t;
        vel[0] *= brake;
        vel[1] *= brake;
        vel[2] *= brake;
      }

      const speed = Math.hypot(vel[0], vel[1], vel[2]);
      const maxSpeed = 9;
      if (speed > maxSpeed) {
        const s = maxSpeed / speed;
        vel[0] *= s;
        vel[1] *= s;
        vel[2] *= s;
      }

      this.posX[i] = pos[0];
      this.posY[i] = pos[1];
      this.posZ[i] = pos[2];
      this.velX[i] = vel[0];
      this.velY[i] = vel[1];
      this.velZ[i] = vel[2];
    }
  }
}
