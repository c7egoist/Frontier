import { clamp } from './math';

export class OrbitCamera {
  targetX = 0;
  targetZ = 0;
  targetY = 1.5;
  dist = 55;
  theta = 2.35; // azimuth
  phi = 0.42;   // elevation above horizon
  fov = 55 * (Math.PI / 180);

  eye(): number[] {
    const ce = Math.cos(this.phi), se = Math.sin(this.phi);
    return [
      this.targetX + this.dist * ce * Math.cos(this.theta),
      this.targetY + this.dist * se,
      this.targetZ + this.dist * ce * Math.sin(this.theta),
    ];
  }

  center(): number[] {
    return [this.targetX, this.targetY, this.targetZ];
  }

  orbit(dx: number, dy: number): void {
    this.theta -= dx * 0.005;
    this.phi = clamp(this.phi + dy * 0.004, 0.06, 1.45);
  }

  zoom(delta: number): void {
    this.dist = clamp(this.dist * Math.exp(delta * 0.0011), 6, 3000);
  }

  pan(dx: number, dz: number): void {
    // pan in camera-facing XZ plane
    const s = this.dist * 0.0016;
    const cx = Math.cos(this.theta), sx = Math.sin(this.theta);
    this.targetX += (-dx * sx + dz * -cx) * s;
    this.targetZ += (dx * cx + dz * -sx) * s;
  }
}
