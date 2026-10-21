import { mat4, vec3 } from "gl-matrix";

/** Simple mouse/touch-driven orbit camera around a focus point. */
export class OrbitCamera {
  yaw = 0.78;
  pitch = 0.42;
  distance = 6.2;
  target: vec3 = vec3.fromValues(0, 1.0, 0);
  minDistance = 2.5;
  maxDistance = 16;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(el: HTMLElement) {
    el.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointerup", (e) => {
      this.dragging = false;
      el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener("pointercancel", () => {
      this.dragging = false;
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw -= dx * 0.0065;
      this.pitch = Math.min(1.45, Math.max(-0.2, this.pitch - dy * 0.0065));
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance + e.deltaY * 0.0045));
      },
      { passive: false },
    );
  }

  get eye(): vec3 {
    const cp = Math.cos(this.pitch);
    const x = this.target[0] + this.distance * cp * Math.sin(this.yaw);
    const y = this.target[1] + this.distance * Math.sin(this.pitch);
    const z = this.target[2] + this.distance * cp * Math.cos(this.yaw);
    return vec3.fromValues(x, y, z);
  }

  viewMatrix(): mat4 {
    const m = mat4.create();
    mat4.lookAt(m, this.eye, this.target, [0, 1, 0]);
    return m;
  }

  /** WebGPU / Direct3D style projection with a [0,1] NDC depth range. */
  projMatrixZeroToOne(aspect: number): mat4 {
    const m = mat4.create();
    mat4.perspectiveZO(m, Math.PI / 4.1, aspect, 0.05, 60);
    return m;
  }

  /** OpenGL / WebGL style projection with a [-1,1] NDC depth range. */
  projMatrixNegOneToOne(aspect: number): mat4 {
    const m = mat4.create();
    mat4.perspectiveNO(m, Math.PI / 4.1, aspect, 0.05, 60);
    return m;
  }
}
