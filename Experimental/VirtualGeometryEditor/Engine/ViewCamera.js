// Orbit / fly editor camera with framing and a scripted descending-spiral fly-through.

import { LookAtTransform, PerspectiveTransform, PerspectiveTransformZeroToOne, MultiplyTransforms, Clamp } from "./LinearAlgebra.js";

export class ViewCamera {
    constructor() {
        this.Mode = "Orbit";
        this.Target = [0, 0, 0];
        this.Position = [0, 5, 20];
        this.Yaw = 0.7;
        this.Pitch = 0.32;
        this.Distance = 60;
        this.Fov = (50 * Math.PI) / 180;
        this.Near = 0.05;
        this.Far = 6000;
        this.FlySpeed = 12;
        this.PathPlaying = false;
        this.PathTime = 0;
        this.PathSphere = [0, 0, 0, 50];
    }

    Direction() {
        const Cp = Math.cos(this.Pitch);
        return [Math.sin(this.Yaw) * Cp, Math.sin(this.Pitch), Math.cos(this.Yaw) * Cp];
    }

    Eye() {
        if (this.Mode === "Fly") return this.Position.slice();
        const D = this.Direction();
        return [this.Target[0] + D[0] * this.Distance, this.Target[1] + D[1] * this.Distance, this.Target[2] + D[2] * this.Distance];
    }

    LookPoint() {
        if (this.Mode !== "Fly") return this.Target.slice();
        const D = this.Direction();
        return [this.Position[0] - D[0], this.Position[1] - D[1], this.Position[2] - D[2]];
    }

    ViewTransform() { return LookAtTransform(this.Eye(), this.LookPoint(), [0, 1, 0]); }

    ViewProjection(Aspect, ZeroToOne = false) {
        const Projection = ZeroToOne
            ? PerspectiveTransformZeroToOne(this.Fov, Aspect, this.Near, this.Far)
            : PerspectiveTransform(this.Fov, Aspect, this.Near, this.Far);
        return MultiplyTransforms(Projection, this.ViewTransform());
    }

    SetMode(Mode) {
        if (Mode === this.Mode) return;
        if (Mode === "Fly") this.Position = this.Eye();
        else {
            const D = this.Direction();
            this.Target = [this.Position[0] - D[0] * this.Distance, this.Position[1] - D[1] * this.Distance, this.Position[2] - D[2] * this.Distance];
        }
        this.Mode = Mode;
    }

    Rotate(DeltaX, DeltaY) {
        this.Yaw -= DeltaX * 0.005;
        this.Pitch = Clamp(this.Pitch + DeltaY * 0.005 * (this.Mode === "Fly" ? -1 : 1), -1.52, 1.52);
    }

    Pan(DeltaX, DeltaY, ViewportHeight) {
        const Scale = (2 * Math.tan(this.Fov / 2) * (this.Mode === "Fly" ? 10 : this.Distance)) / Math.max(1, ViewportHeight);
        const D = this.Direction();
        const Right = [Math.cos(this.Yaw), 0, -Math.sin(this.Yaw)];
        const Up = [-D[0] * D[1], 1 - D[1] * D[1], -D[2] * D[1]];
        const UpLength = Math.hypot(...Up) || 1;
        const Anchor = this.Mode === "Fly" ? this.Position : this.Target;
        for (let Axis = 0; Axis < 3; Axis++) Anchor[Axis] += (-Right[Axis] * DeltaX + (Up[Axis] / UpLength) * DeltaY) * Scale;
    }

    Dolly(Steps) {
        if (this.Mode === "Fly") {
            const D = this.Direction();
            for (let Axis = 0; Axis < 3; Axis++) this.Position[Axis] -= D[Axis] * Steps * this.FlySpeed * 0.15;
            return;
        }
        this.Distance = Clamp(this.Distance * Math.pow(1.0018, Steps * 100 / 100), 0.15, 4000);
    }

    // Keys: Set of lowercase key names; Seconds since last tick.
    FlyMove(Keys, Seconds, Boost) {
        if (this.Mode !== "Fly") return false;
        const D = this.Direction();
        const Right = [Math.cos(this.Yaw), 0, -Math.sin(this.Yaw)];
        const Step = this.FlySpeed * Seconds * (Boost ? 4 : 1);
        let Moved = false;
        const Move = (V, Sign) => { for (let Axis = 0; Axis < 3; Axis++) this.Position[Axis] += V[Axis] * Sign * Step; Moved = true; };
        if (Keys.has("w")) Move(D, -1);
        if (Keys.has("s")) Move(D, 1);
        if (Keys.has("a")) Move(Right, -1);
        if (Keys.has("d")) Move(Right, 1);
        if (Keys.has("e")) Move([0, 1, 0], 1);
        if (Keys.has("q")) Move([0, 1, 0], -1);
        return Moved;
    }

    FrameSphere(Sphere) {
        this.SetMode("Orbit");
        this.Target = [Sphere[0], Sphere[1], Sphere[2]];
        this.Distance = Clamp((Sphere[3] / Math.sin(this.Fov / 2)) * 1.1, 0.5, 4000);
    }

    // Descending spiral from a high overview into a close pass over the scene.
    AdvancePath(Seconds, Duration = 28) {
        if (!this.PathPlaying) return;
        this.PathTime = (this.PathTime + Seconds / Duration) % 1;
        const T = this.PathTime;
        const S = this.PathSphere;
        const Ease = 0.5 - 0.5 * Math.cos(T * Math.PI * 2); // 0 → 1 → 0 (out and back)
        const Radius = S[3] * (1.25 - Ease * 1.08);
        const Height = S[1] + S[3] * (0.55 - Ease * 0.5) + 1.5;
        const Angle = T * Math.PI * 3 + 0.6;
        this.Mode = "Fly";
        this.Position = [S[0] + Math.cos(Angle) * Radius, Height, S[2] + Math.sin(Angle) * Radius];
        const LookX = S[0] + Math.cos(Angle + 0.9) * Radius * 0.35, LookZ = S[2] + Math.sin(Angle + 0.9) * Radius * 0.35;
        const Dx = this.Position[0] - LookX, Dy = this.Position[1] - S[1], Dz = this.Position[2] - LookZ;
        const Length = Math.hypot(Dx, Dy, Dz) || 1;
        this.Yaw = Math.atan2(Dx, Dz);
        this.Pitch = Math.asin(Clamp(Dy / Length, -1, 1));
    }

    Snapshot() {
        return { Mode: this.Mode, Target: this.Target.slice(), Position: this.Position.slice(), Yaw: this.Yaw, Pitch: this.Pitch, Distance: this.Distance, Fov: this.Fov };
    }
}
