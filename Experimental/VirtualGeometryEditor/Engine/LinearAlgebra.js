// Column-major 4×4 transforms, view-volume planes, and sphere helpers shared by the
// cluster hierarchy builder, the cut selector, and both GPU rasterization paths.

export function IdentityTransform() {
    const Out = new Float32Array(16);
    Out[0] = Out[5] = Out[10] = Out[15] = 1;
    return Out;
}

export function MultiplyTransforms(A, B, Out = new Float32Array(16)) {
    const R = new Float32Array(16);
    for (let Column = 0; Column < 4; Column++) {
        for (let Row = 0; Row < 4; Row++) {
            R[Column * 4 + Row] =
                A[Row] * B[Column * 4] +
                A[4 + Row] * B[Column * 4 + 1] +
                A[8 + Row] * B[Column * 4 + 2] +
                A[12 + Row] * B[Column * 4 + 3];
        }
    }
    Out.set(R);
    return Out;
}

// OpenGL clip space (z in −w..w).
export function PerspectiveTransform(VerticalFov, Aspect, Near, Far) {
    const F = 1 / Math.tan(VerticalFov / 2);
    const Out = new Float32Array(16);
    Out[0] = F / Aspect;
    Out[5] = F;
    Out[10] = (Far + Near) / (Near - Far);
    Out[11] = -1;
    Out[14] = (2 * Far * Near) / (Near - Far);
    return Out;
}

// WebGPU clip space (z in 0..w).
export function PerspectiveTransformZeroToOne(VerticalFov, Aspect, Near, Far) {
    const F = 1 / Math.tan(VerticalFov / 2);
    const Out = new Float32Array(16);
    Out[0] = F / Aspect;
    Out[5] = F;
    Out[10] = Far / (Near - Far);
    Out[11] = -1;
    Out[14] = (Far * Near) / (Near - Far);
    return Out;
}

export function LookAtTransform(Eye, Target, Up) {
    let Zx = Eye[0] - Target[0], Zy = Eye[1] - Target[1], Zz = Eye[2] - Target[2];
    let Length = Math.hypot(Zx, Zy, Zz) || 1;
    Zx /= Length; Zy /= Length; Zz /= Length;
    let Xx = Up[1] * Zz - Up[2] * Zy, Xy = Up[2] * Zx - Up[0] * Zz, Xz = Up[0] * Zy - Up[1] * Zx;
    Length = Math.hypot(Xx, Xy, Xz) || 1;
    Xx /= Length; Xy /= Length; Xz /= Length;
    const Yx = Zy * Xz - Zz * Xy, Yy = Zz * Xx - Zx * Xz, Yz = Zx * Xy - Zy * Xx;
    const Out = new Float32Array(16);
    Out[0] = Xx; Out[1] = Yx; Out[2] = Zx;
    Out[4] = Xy; Out[5] = Yy; Out[6] = Zy;
    Out[8] = Xz; Out[9] = Yz; Out[10] = Zz;
    Out[12] = -(Xx * Eye[0] + Xy * Eye[1] + Xz * Eye[2]);
    Out[13] = -(Yx * Eye[0] + Yy * Eye[1] + Yz * Eye[2]);
    Out[14] = -(Zx * Eye[0] + Zy * Eye[1] + Zz * Eye[2]);
    Out[15] = 1;
    return Out;
}

export function InvertTransform(M) {
    const Inv = new Float32Array(16);
    Inv[0] = M[5] * M[10] * M[15] - M[5] * M[11] * M[14] - M[9] * M[6] * M[15] + M[9] * M[7] * M[14] + M[13] * M[6] * M[11] - M[13] * M[7] * M[10];
    Inv[4] = -M[4] * M[10] * M[15] + M[4] * M[11] * M[14] + M[8] * M[6] * M[15] - M[8] * M[7] * M[14] - M[12] * M[6] * M[11] + M[12] * M[7] * M[10];
    Inv[8] = M[4] * M[9] * M[15] - M[4] * M[11] * M[13] - M[8] * M[5] * M[15] + M[8] * M[7] * M[13] + M[12] * M[5] * M[11] - M[12] * M[7] * M[9];
    Inv[12] = -M[4] * M[9] * M[14] + M[4] * M[10] * M[13] + M[8] * M[5] * M[14] - M[8] * M[6] * M[13] - M[12] * M[5] * M[10] + M[12] * M[6] * M[9];
    Inv[1] = -M[1] * M[10] * M[15] + M[1] * M[11] * M[14] + M[9] * M[2] * M[15] - M[9] * M[3] * M[14] - M[13] * M[2] * M[11] + M[13] * M[3] * M[10];
    Inv[5] = M[0] * M[10] * M[15] - M[0] * M[11] * M[14] - M[8] * M[2] * M[15] + M[8] * M[3] * M[14] + M[12] * M[2] * M[11] - M[12] * M[3] * M[10];
    Inv[9] = -M[0] * M[9] * M[15] + M[0] * M[11] * M[13] + M[8] * M[1] * M[15] - M[8] * M[3] * M[13] - M[12] * M[1] * M[11] + M[12] * M[3] * M[9];
    Inv[13] = M[0] * M[9] * M[14] - M[0] * M[10] * M[13] - M[8] * M[1] * M[14] + M[8] * M[2] * M[13] + M[12] * M[1] * M[10] - M[12] * M[2] * M[9];
    Inv[2] = M[1] * M[6] * M[15] - M[1] * M[7] * M[14] - M[5] * M[2] * M[15] + M[5] * M[3] * M[14] + M[13] * M[2] * M[7] - M[13] * M[3] * M[6];
    Inv[6] = -M[0] * M[6] * M[15] + M[0] * M[7] * M[14] + M[4] * M[2] * M[15] - M[4] * M[3] * M[14] - M[12] * M[2] * M[7] + M[12] * M[3] * M[6];
    Inv[10] = M[0] * M[5] * M[15] - M[0] * M[7] * M[13] - M[4] * M[1] * M[15] + M[4] * M[3] * M[13] + M[12] * M[1] * M[7] - M[12] * M[3] * M[5];
    Inv[14] = -M[0] * M[5] * M[14] + M[0] * M[6] * M[13] + M[4] * M[1] * M[14] - M[4] * M[2] * M[13] - M[12] * M[1] * M[6] + M[12] * M[2] * M[5];
    Inv[3] = -M[1] * M[6] * M[11] + M[1] * M[7] * M[10] + M[5] * M[2] * M[11] - M[5] * M[3] * M[10] - M[9] * M[2] * M[7] + M[9] * M[3] * M[6];
    Inv[7] = M[0] * M[6] * M[11] - M[0] * M[7] * M[10] - M[4] * M[2] * M[11] + M[4] * M[3] * M[10] + M[8] * M[2] * M[7] - M[8] * M[3] * M[6];
    Inv[11] = -M[0] * M[5] * M[11] + M[0] * M[7] * M[9] + M[4] * M[1] * M[11] - M[4] * M[3] * M[9] - M[8] * M[1] * M[7] + M[8] * M[3] * M[5];
    Inv[15] = M[0] * M[5] * M[10] - M[0] * M[6] * M[9] - M[4] * M[1] * M[10] + M[4] * M[2] * M[9] + M[8] * M[1] * M[6] - M[8] * M[2] * M[5];
    let Determinant = M[0] * Inv[0] + M[1] * Inv[4] + M[2] * Inv[8] + M[3] * Inv[12];
    if (Math.abs(Determinant) < 1e-20) return IdentityTransform();
    Determinant = 1 / Determinant;
    for (let Index = 0; Index < 16; Index++) Inv[Index] *= Determinant;
    return Inv;
}

// Yaw rotation + uniform scale + translation (instance placement).
export function PlacementTransform(X, Y, Z, Yaw, Scale) {
    const C = Math.cos(Yaw) * Scale, S = Math.sin(Yaw) * Scale;
    const Out = new Float32Array(16);
    Out[0] = C; Out[2] = -S;
    Out[5] = Scale;
    Out[8] = S; Out[10] = C;
    Out[12] = X; Out[13] = Y; Out[14] = Z; Out[15] = 1;
    return Out;
}

export function TransformPoint(M, X, Y, Z, Out = [0, 0, 0]) {
    const W = M[3] * X + M[7] * Y + M[11] * Z + M[15] || 1;
    Out[0] = (M[0] * X + M[4] * Y + M[8] * Z + M[12]) / W;
    Out[1] = (M[1] * X + M[5] * Y + M[9] * Z + M[13]) / W;
    Out[2] = (M[2] * X + M[6] * Y + M[10] * Z + M[14]) / W;
    return Out;
}

// Gribb–Hartmann plane extraction; planes face inward, normalized. Six planes × 4 floats.
export function ExtractViewVolumePlanes(ViewProjection, Out = new Float32Array(24)) {
    const M = ViewProjection;
    const Rows = [
        [M[3] + M[0], M[7] + M[4], M[11] + M[8], M[15] + M[12]],
        [M[3] - M[0], M[7] - M[4], M[11] - M[8], M[15] - M[12]],
        [M[3] + M[1], M[7] + M[5], M[11] + M[9], M[15] + M[13]],
        [M[3] - M[1], M[7] - M[5], M[11] - M[9], M[15] - M[13]],
        [M[3] + M[2], M[7] + M[6], M[11] + M[10], M[15] + M[14]],
        [M[3] - M[2], M[7] - M[6], M[11] - M[10], M[15] - M[14]],
    ];
    for (let Index = 0; Index < 6; Index++) {
        const P = Rows[Index];
        const Length = Math.hypot(P[0], P[1], P[2]) || 1;
        Out[Index * 4] = P[0] / Length;
        Out[Index * 4 + 1] = P[1] / Length;
        Out[Index * 4 + 2] = P[2] / Length;
        Out[Index * 4 + 3] = P[3] / Length;
    }
    return Out;
}

// World planes → instance-local planes: plane_local = plane_world · M (row vector).
// Re-normalized so distances stay in local units.
export function TransformPlanesToLocal(Planes, Placement, Out = new Float32Array(24)) {
    for (let Index = 0; Index < 6; Index++) {
        const A = Planes[Index * 4], B = Planes[Index * 4 + 1], C = Planes[Index * 4 + 2], D = Planes[Index * 4 + 3];
        const Lx = A * Placement[0] + B * Placement[1] + C * Placement[2];
        const Ly = A * Placement[4] + B * Placement[5] + C * Placement[6];
        const Lz = A * Placement[8] + B * Placement[9] + C * Placement[10];
        const Ld = A * Placement[12] + B * Placement[13] + C * Placement[14] + D;
        const Length = Math.hypot(Lx, Ly, Lz) || 1;
        Out[Index * 4] = Lx / Length;
        Out[Index * 4 + 1] = Ly / Length;
        Out[Index * 4 + 2] = Lz / Length;
        Out[Index * 4 + 3] = Ld / Length;
    }
    return Out;
}

export function SphereInsideViewVolume(Planes, X, Y, Z, Radius) {
    for (let Index = 0; Index < 24; Index += 4) {
        if (Planes[Index] * X + Planes[Index + 1] * Y + Planes[Index + 2] * Z + Planes[Index + 3] < -Radius) return false;
    }
    return true;
}

// Sphere enclosing a list of spheres given as flat [x, y, z, r, …] with stride.
export function EncloseSpheres(Spheres, Stride, Offset, Count, Out = new Float64Array(4)) {
    if (Count === 0) { Out[0] = Out[1] = Out[2] = Out[3] = 0; return Out; }
    let MinX = Infinity, MinY = Infinity, MinZ = Infinity, MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
    for (let Index = 0; Index < Count; Index++) {
        const Base = Offset + Index * Stride;
        const R = Spheres[Base + 3];
        MinX = Math.min(MinX, Spheres[Base] - R); MaxX = Math.max(MaxX, Spheres[Base] + R);
        MinY = Math.min(MinY, Spheres[Base + 1] - R); MaxY = Math.max(MaxY, Spheres[Base + 1] + R);
        MinZ = Math.min(MinZ, Spheres[Base + 2] - R); MaxZ = Math.max(MaxZ, Spheres[Base + 2] + R);
    }
    const Cx = (MinX + MaxX) / 2, Cy = (MinY + MaxY) / 2, Cz = (MinZ + MaxZ) / 2;
    let Radius = 0;
    for (let Index = 0; Index < Count; Index++) {
        const Base = Offset + Index * Stride;
        Radius = Math.max(Radius, Math.hypot(Spheres[Base] - Cx, Spheres[Base + 1] - Cy, Spheres[Base + 2] - Cz) + Spheres[Base + 3]);
    }
    Out[0] = Cx; Out[1] = Cy; Out[2] = Cz; Out[3] = Radius * (1 + 1e-6) + 1e-9;
    return Out;
}

export function Clamp(Scalar, Low, High) {
    return Scalar < Low ? Low : Scalar > High ? High : Scalar;
}
