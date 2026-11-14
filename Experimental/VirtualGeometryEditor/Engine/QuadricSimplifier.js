// Quadric-error edge-collapse simplifier (Garland–Heckbert) with:
//   • locked vertices that never move (cluster-group seams → crack-free hierarchy),
//   • open-border preservation (border vertices only slide along border edges, plus
//     perpendicular constraint planes),
//   • link-condition manifold guard, triangle-flip / sliver rejection,
//   • area-weighted, normalized quadrics so the returned error is a world-space distance.
//
// Input positions/indices are not modified. Vertex ids are preserved in the output
// (removed vertices simply become unreferenced); moved vertices receive new positions.

const VertexInterior = 0;
const VertexBorder = 1;
const VertexLocked = 2;

class CollapseHeap {
    constructor(Capacity = 1024) {
        this.Cost = new Float64Array(Capacity);
        this.EndA = new Int32Array(Capacity);
        this.EndB = new Int32Array(Capacity);
        this.StampA = new Int32Array(Capacity);
        this.StampB = new Int32Array(Capacity);
        this.Count = 0;
    }
    Grow() {
        const Capacity = this.Cost.length * 2;
        for (const Key of ["Cost", "EndA", "EndB", "StampA", "StampB"]) {
            const Next = new this[Key].constructor(Capacity);
            Next.set(this[Key]);
            this[Key] = Next;
        }
    }
    Swap(I, J) {
        for (const Key of ["Cost", "EndA", "EndB", "StampA", "StampB"]) {
            const Array = this[Key];
            const Held = Array[I]; Array[I] = Array[J]; Array[J] = Held;
        }
    }
    Push(Cost, A, B, StampA, StampB) {
        if (this.Count === this.Cost.length) this.Grow();
        let Index = this.Count++;
        this.Cost[Index] = Cost; this.EndA[Index] = A; this.EndB[Index] = B; this.StampA[Index] = StampA; this.StampB[Index] = StampB;
        while (Index > 0) {
            const Up = (Index - 1) >> 1;
            if (this.Cost[Up] <= this.Cost[Index]) break;
            this.Swap(Up, Index);
            Index = Up;
        }
    }
    // Moves the minimum entry to slot [Count] (just past the end) and returns true.
    Pop() {
        if (this.Count === 0) return false;
        const Last = --this.Count;
        this.Swap(0, Last);
        let Index = 0;
        for (;;) {
            const Left = Index * 2 + 1, Right = Left + 1;
            let Smallest = Index;
            if (Left < Last && this.Cost[Left] < this.Cost[Smallest]) Smallest = Left;
            if (Right < Last && this.Cost[Right] < this.Cost[Smallest]) Smallest = Right;
            if (Smallest === Index) break;
            this.Swap(Smallest, Index);
            Index = Smallest;
        }
        return true;
    }
}

function AddPlane(Quadrics, Vertex, A, B, C, D, Weight) {
    const Q = Vertex * 11;
    Quadrics[Q] += Weight * A * A; Quadrics[Q + 1] += Weight * A * B; Quadrics[Q + 2] += Weight * A * C; Quadrics[Q + 3] += Weight * A * D;
    Quadrics[Q + 4] += Weight * B * B; Quadrics[Q + 5] += Weight * B * C; Quadrics[Q + 6] += Weight * B * D;
    Quadrics[Q + 7] += Weight * C * C; Quadrics[Q + 8] += Weight * C * D; Quadrics[Q + 9] += Weight * D * D;
    Quadrics[Q + 10] += Weight;
}

// Normalized quadric error of (Qa + Qb) at point (X, Y, Z).
function QuadricError(Quadrics, A, B, X, Y, Z) {
    const Qa = A * 11, Qb = B * 11;
    const Q0 = Quadrics[Qa] + Quadrics[Qb], Q1 = Quadrics[Qa + 1] + Quadrics[Qb + 1], Q2 = Quadrics[Qa + 2] + Quadrics[Qb + 2];
    const Q3 = Quadrics[Qa + 3] + Quadrics[Qb + 3], Q4 = Quadrics[Qa + 4] + Quadrics[Qb + 4], Q5 = Quadrics[Qa + 5] + Quadrics[Qb + 5];
    const Q6 = Quadrics[Qa + 6] + Quadrics[Qb + 6], Q7 = Quadrics[Qa + 7] + Quadrics[Qb + 7], Q8 = Quadrics[Qa + 8] + Quadrics[Qb + 8];
    const Q9 = Quadrics[Qa + 9] + Quadrics[Qb + 9], W = Quadrics[Qa + 10] + Quadrics[Qb + 10];
    const E = X * X * Q0 + 2 * X * Y * Q1 + 2 * X * Z * Q2 + 2 * X * Q3 + Y * Y * Q4 + 2 * Y * Z * Q5 + 2 * Y * Q6 + Z * Z * Q7 + 2 * Z * Q8 + Q9;
    return Math.max(0, E) / Math.max(W, 1e-30);
}

// Minimizer of (Qa + Qb); returns null if ill-conditioned.
function OptimalPosition(Quadrics, A, B) {
    const Qa = A * 11, Qb = B * 11;
    const M00 = Quadrics[Qa] + Quadrics[Qb], M01 = Quadrics[Qa + 1] + Quadrics[Qb + 1], M02 = Quadrics[Qa + 2] + Quadrics[Qb + 2];
    const M11 = Quadrics[Qa + 4] + Quadrics[Qb + 4], M12 = Quadrics[Qa + 5] + Quadrics[Qb + 5], M22 = Quadrics[Qa + 7] + Quadrics[Qb + 7];
    const Bx = -(Quadrics[Qa + 3] + Quadrics[Qb + 3]), By = -(Quadrics[Qa + 6] + Quadrics[Qb + 6]), Bz = -(Quadrics[Qa + 8] + Quadrics[Qb + 8]);
    const C00 = M11 * M22 - M12 * M12, C01 = M02 * M12 - M01 * M22, C02 = M01 * M12 - M02 * M11;
    const Determinant = M00 * C00 + M01 * C01 + M02 * C02;
    const Scale = M00 + M11 + M22;
    if (!(Math.abs(Determinant) > 1e-9 * Scale * Scale * Scale) || Scale <= 0) return null;
    const C11 = M00 * M22 - M02 * M02, C12 = M01 * M02 - M00 * M12, C22 = M00 * M11 - M01 * M01;
    const Inverse = 1 / Determinant;
    return [
        (C00 * Bx + C01 * By + C02 * Bz) * Inverse,
        (C01 * Bx + C11 * By + C12 * Bz) * Inverse,
        (C02 * Bx + C12 * By + C22 * Bz) * Inverse,
    ];
}

export function SimplifyTriangles(SourcePositions, SourceIndices, Options = {}) {
    const TargetTriangleCount = Math.max(1, Options.TargetTriangleCount ?? Math.floor(SourceIndices.length / 6));
    const MaxError = Options.MaxError ?? Infinity;
    const LockedVertices = Options.LockedVertices ?? null;
    const BorderWeight = Options.BorderWeight ?? 4;
    const MinNormalAlignment = Options.MinNormalAlignment ?? 0.1;

    const VertexCount = SourcePositions.length / 3;
    const TriangleCount = SourceIndices.length / 3;
    const Positions = Float64Array.from(SourcePositions);
    const Triangles = Int32Array.from(SourceIndices);
    const TriangleAlive = new Uint8Array(TriangleCount).fill(1);
    const VertexAlive = new Uint8Array(VertexCount);
    const VertexClass = new Uint8Array(VertexCount);
    const Stamp = new Int32Array(VertexCount);
    const Marker = new Int32Array(VertexCount);
    let MarkerEpoch = 0;
    const Quadrics = new Float64Array(VertexCount * 11);
    const VertexTriangles = new Array(VertexCount);
    for (let Vertex = 0; Vertex < VertexCount; Vertex++) VertexTriangles[Vertex] = [];

    let BoundsExtent = 0;
    for (let Triangle = 0; Triangle < TriangleCount; Triangle++) {
        const A = Triangles[Triangle * 3], B = Triangles[Triangle * 3 + 1], C = Triangles[Triangle * 3 + 2];
        VertexTriangles[A].push(Triangle); VertexTriangles[B].push(Triangle); VertexTriangles[C].push(Triangle);
        VertexAlive[A] = VertexAlive[B] = VertexAlive[C] = 1;
        const Ax = Positions[A * 3], Ay = Positions[A * 3 + 1], Az = Positions[A * 3 + 2];
        const Ux = Positions[B * 3] - Ax, Uy = Positions[B * 3 + 1] - Ay, Uz = Positions[B * 3 + 2] - Az;
        const Vx = Positions[C * 3] - Ax, Vy = Positions[C * 3 + 1] - Ay, Vz = Positions[C * 3 + 2] - Az;
        let Nx = Uy * Vz - Uz * Vy, Ny = Uz * Vx - Ux * Vz, Nz = Ux * Vy - Uy * Vx;
        const Length = Math.hypot(Nx, Ny, Nz);
        BoundsExtent = Math.max(BoundsExtent, Math.hypot(Ux, Uy, Uz));
        if (Length < 1e-30) continue;
        Nx /= Length; Ny /= Length; Nz /= Length;
        const D = -(Nx * Ax + Ny * Ay + Nz * Az);
        const Area = Length * 0.5;
        AddPlane(Quadrics, A, Nx, Ny, Nz, D, Area);
        AddPlane(Quadrics, B, Nx, Ny, Nz, D, Area);
        AddPlane(Quadrics, C, Nx, Ny, Nz, D, Area);
    }

    // Edge census → border edges, non-manifold edges, and unique collapse candidates.
    const EdgeCensus = new Map();
    for (let Triangle = 0; Triangle < TriangleCount; Triangle++) {
        for (let Corner = 0; Corner < 3; Corner++) {
            const A = Triangles[Triangle * 3 + Corner], B = Triangles[Triangle * 3 + ((Corner + 1) % 3)];
            const Key = A < B ? A * VertexCount + B : B * VertexCount + A;
            const Held = EdgeCensus.get(Key);
            if (Held === undefined) EdgeCensus.set(Key, Triangle * 4 + 1);
            else EdgeCensus.set(Key, (Held & ~3) | Math.min(3, (Held & 3) + 1));
        }
    }
    for (const [Key, Packed] of EdgeCensus) {
        const Uses = Packed & 3;
        const A = Math.floor(Key / VertexCount), B = Key - A * VertexCount;
        if (Uses === 1) {
            VertexClass[A] = Math.max(VertexClass[A], VertexBorder);
            VertexClass[B] = Math.max(VertexClass[B], VertexBorder);
            const Triangle = Packed >> 2;
            const T0 = Triangles[Triangle * 3], T1 = Triangles[Triangle * 3 + 1], T2 = Triangles[Triangle * 3 + 2];
            const Ux = Positions[T1 * 3] - Positions[T0 * 3], Uy = Positions[T1 * 3 + 1] - Positions[T0 * 3 + 1], Uz = Positions[T1 * 3 + 2] - Positions[T0 * 3 + 2];
            const Vx = Positions[T2 * 3] - Positions[T0 * 3], Vy = Positions[T2 * 3 + 1] - Positions[T0 * 3 + 1], Vz = Positions[T2 * 3 + 2] - Positions[T0 * 3 + 2];
            const Nx = Uy * Vz - Uz * Vy, Ny = Uz * Vx - Ux * Vz, Nz = Ux * Vy - Uy * Vx;
            const Ex = Positions[B * 3] - Positions[A * 3], Ey = Positions[B * 3 + 1] - Positions[A * 3 + 1], Ez = Positions[B * 3 + 2] - Positions[A * 3 + 2];
            let Px = Ey * Nz - Ez * Ny, Py = Ez * Nx - Ex * Nz, Pz = Ex * Ny - Ey * Nx;
            const PLength = Math.hypot(Px, Py, Pz);
            if (PLength > 1e-30) {
                Px /= PLength; Py /= PLength; Pz /= PLength;
                const D = -(Px * Positions[A * 3] + Py * Positions[A * 3 + 1] + Pz * Positions[A * 3 + 2]);
                const Weight = (Ex * Ex + Ey * Ey + Ez * Ez) * BorderWeight;
                AddPlane(Quadrics, A, Px, Py, Pz, D, Weight);
                AddPlane(Quadrics, B, Px, Py, Pz, D, Weight);
            }
        } else if (Uses > 2) {
            VertexClass[A] = VertexClass[B] = VertexLocked;
        }
    }
    if (LockedVertices) for (let Vertex = 0; Vertex < VertexCount; Vertex++) if (LockedVertices[Vertex]) VertexClass[Vertex] = VertexLocked;

    const Neighbors = (Vertex, Out) => {
        Out.length = 0;
        MarkerEpoch++;
        Marker[Vertex] = MarkerEpoch;
        for (const Triangle of VertexTriangles[Vertex]) {
            if (!TriangleAlive[Triangle]) continue;
            for (let Corner = 0; Corner < 3; Corner++) {
                const Other = Triangles[Triangle * 3 + Corner];
                if (Marker[Other] !== MarkerEpoch) { Marker[Other] = MarkerEpoch; Out.push(Other); }
            }
        }
        return Out;
    };

    const SharedCount = (A, B) => {
        let Count = 0;
        for (const Triangle of VertexTriangles[A]) {
            if (!TriangleAlive[Triangle]) continue;
            const T = Triangle * 3;
            if (Triangles[T] === B || Triangles[T + 1] === B || Triangles[T + 2] === B) Count++;
        }
        return Count;
    };

    // Best collapse for edge (A, B): returns [Cost, Remove, Keep, X, Y, Z] or null.
    const PlanCollapse = (A, B) => {
        const ClassA = VertexClass[A], ClassB = VertexClass[B];
        if (ClassA === VertexLocked && ClassB === VertexLocked) return null;
        const Shared = SharedCount(A, B);
        if (Shared === 0) return null;
        const BorderEdge = Shared === 1;
        if (ClassA === VertexInterior && ClassB === VertexInterior) {
            const Ax = Positions[A * 3], Ay = Positions[A * 3 + 1], Az = Positions[A * 3 + 2];
            const Bx = Positions[B * 3], By = Positions[B * 3 + 1], Bz = Positions[B * 3 + 2];
            const EdgeLength = Math.hypot(Bx - Ax, By - Ay, Bz - Az);
            const Candidates = [[Ax, Ay, Az], [Bx, By, Bz], [(Ax + Bx) / 2, (Ay + By) / 2, (Az + Bz) / 2]];
            const Optimal = OptimalPosition(Quadrics, A, B);
            if (Optimal && Math.hypot(Optimal[0] - (Ax + Bx) / 2, Optimal[1] - (Ay + By) / 2, Optimal[2] - (Az + Bz) / 2) <= EdgeLength * 1.5) Candidates.push(Optimal);
            let Best = null;
            for (const P of Candidates) {
                const Cost = QuadricError(Quadrics, A, B, P[0], P[1], P[2]);
                if (!Best || Cost < Best[0]) Best = [Cost, B, A, P[0], P[1], P[2]];
            }
            return Best;
        }
        const Removable = (Vertex) => VertexClass[Vertex] === VertexInterior || (VertexClass[Vertex] === VertexBorder && BorderEdge);
        let Best = null;
        if (Removable(B)) {
            const Cost = QuadricError(Quadrics, A, B, Positions[A * 3], Positions[A * 3 + 1], Positions[A * 3 + 2]);
            Best = [Cost, B, A, Positions[A * 3], Positions[A * 3 + 1], Positions[A * 3 + 2]];
        }
        if (Removable(A)) {
            const Cost = QuadricError(Quadrics, A, B, Positions[B * 3], Positions[B * 3 + 1], Positions[B * 3 + 2]);
            if (!Best || Cost < Best[0]) Best = [Cost, A, B, Positions[B * 3], Positions[B * 3 + 1], Positions[B * 3 + 2]];
        }
        return Best;
    };

    const NeighborsRemove = [];
    const NeighborsKeep = [];
    const CollapseValid = (Remove, Keep, X, Y, Z) => {
        // Link condition: common neighbors must equal the opposite corners of shared triangles.
        let Shared = 0;
        MarkerEpoch++;
        const OppositeEpoch = MarkerEpoch;
        for (const Triangle of VertexTriangles[Remove]) {
            if (!TriangleAlive[Triangle]) continue;
            const T = Triangle * 3;
            const A = Triangles[T], B = Triangles[T + 1], C = Triangles[T + 2];
            if (A !== Keep && B !== Keep && C !== Keep) continue;
            Shared++;
            const Opposite = A !== Remove && A !== Keep ? A : B !== Remove && B !== Keep ? B : C;
            if (Marker[Opposite] === OppositeEpoch) return false; // duplicate fan
            Marker[Opposite] = OppositeEpoch;
        }
        if (Shared === 0) return false;
        Neighbors(Remove, NeighborsRemove);
        const RemoveEpoch = MarkerEpoch;
        let Common = 0;
        for (const Triangle of VertexTriangles[Keep]) {
            if (!TriangleAlive[Triangle]) continue;
            for (let Corner = 0; Corner < 3; Corner++) {
                const Other = Triangles[Triangle * 3 + Corner];
                if (Other === Keep || Other === Remove) continue;
                if (Marker[Other] === RemoveEpoch) { Marker[Other] = -RemoveEpoch; Common++; }
            }
        }
        if (Common !== Shared) return false;
        // Flip and sliver rejection on every surviving triangle that moves.
        for (const Vertex of [Remove, Keep]) {
            for (const Triangle of VertexTriangles[Vertex]) {
                if (!TriangleAlive[Triangle]) continue;
                const T = Triangle * 3;
                let A = Triangles[T], B = Triangles[T + 1], C = Triangles[T + 2];
                if ((A === Remove || B === Remove || C === Remove) && (A === Keep || B === Keep || C === Keep)) continue;
                const Old = [A, B, C];
                const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
                const Q = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
                for (let Corner = 0; Corner < 3; Corner++) {
                    const V = Old[Corner];
                    P[Corner][0] = Positions[V * 3]; P[Corner][1] = Positions[V * 3 + 1]; P[Corner][2] = Positions[V * 3 + 2];
                    if (V === Remove || V === Keep) { Q[Corner][0] = X; Q[Corner][1] = Y; Q[Corner][2] = Z; }
                    else { Q[Corner][0] = P[Corner][0]; Q[Corner][1] = P[Corner][1]; Q[Corner][2] = P[Corner][2]; }
                }
                const NormalOld = TriangleNormal(P), NormalNew = TriangleNormal(Q);
                const LengthOld = Math.hypot(NormalOld[0], NormalOld[1], NormalOld[2]);
                const LengthNew = Math.hypot(NormalNew[0], NormalNew[1], NormalNew[2]);
                if (LengthNew < 1e-14 * BoundsExtent * BoundsExtent) return false;
                if (LengthOld < 1e-30) continue;
                const Alignment = (NormalOld[0] * NormalNew[0] + NormalOld[1] * NormalNew[1] + NormalOld[2] * NormalNew[2]) / (LengthOld * LengthNew);
                if (Alignment < MinNormalAlignment) return false;
            }
        }
        return true;
    };

    const Heap = new CollapseHeap(Math.max(1024, EdgeCensus.size + 16));
    const PushEdge = (A, B) => {
        const Plan = PlanCollapse(A, B);
        if (Plan) Heap.Push(Plan[0], A, B, Stamp[A], Stamp[B]);
    };
    for (const Key of EdgeCensus.keys()) {
        const A = Math.floor(Key / VertexCount), B = Key - A * VertexCount;
        PushEdge(A, B);
    }

    let AliveTriangles = TriangleCount;
    let ErrorReached = 0;
    let Collapses = 0;
    const MaxErrorSquared = MaxError * MaxError;
    while (AliveTriangles > TargetTriangleCount && Heap.Pop()) {
        const Slot = Heap.Count;
        const A = Heap.EndA[Slot], B = Heap.EndB[Slot];
        if (!VertexAlive[A] || !VertexAlive[B]) continue;
        if (Heap.StampA[Slot] !== Stamp[A] || Heap.StampB[Slot] !== Stamp[B]) continue;
        const Plan = PlanCollapse(A, B);
        if (!Plan) continue;
        const [Cost, Remove, Keep, X, Y, Z] = Plan;
        if (Cost > MaxErrorSquared) break;
        if (!CollapseValid(Remove, Keep, X, Y, Z)) continue;

        // Apply: kill shared triangles, rewire the removed vertex's fan, merge quadrics.
        for (const Triangle of VertexTriangles[Remove]) {
            if (!TriangleAlive[Triangle]) continue;
            const T = Triangle * 3;
            if (Triangles[T] === Keep || Triangles[T + 1] === Keep || Triangles[T + 2] === Keep) {
                TriangleAlive[Triangle] = 0;
                AliveTriangles--;
                continue;
            }
            for (let Corner = 0; Corner < 3; Corner++) if (Triangles[T + Corner] === Remove) Triangles[T + Corner] = Keep;
        }
        const Merged = new Set();
        for (const List of [VertexTriangles[Keep], VertexTriangles[Remove]]) {
            for (const Triangle of List) if (TriangleAlive[Triangle]) Merged.add(Triangle);
        }
        VertexTriangles[Keep] = Array.from(Merged);
        VertexTriangles[Remove] = [];
        VertexAlive[Remove] = 0;
        Positions[Keep * 3] = X; Positions[Keep * 3 + 1] = Y; Positions[Keep * 3 + 2] = Z;
        for (let Index = 0; Index < 11; Index++) Quadrics[Keep * 11 + Index] += Quadrics[Remove * 11 + Index];
        Stamp[Keep]++;
        ErrorReached = Math.max(ErrorReached, Math.sqrt(Cost));
        Collapses++;
        for (const Other of Neighbors(Keep, NeighborsKeep)) if (Other !== Keep) PushEdge(Keep, Other);
    }

    const OutIndices = new Uint32Array(AliveTriangles * 3);
    let Cursor = 0;
    for (let Triangle = 0; Triangle < TriangleCount; Triangle++) {
        if (!TriangleAlive[Triangle]) continue;
        OutIndices[Cursor++] = Triangles[Triangle * 3];
        OutIndices[Cursor++] = Triangles[Triangle * 3 + 1];
        OutIndices[Cursor++] = Triangles[Triangle * 3 + 2];
    }
    return {
        Positions: Float32Array.from(Positions),
        Indices: OutIndices,
        Error: ErrorReached,
        TriangleCount: AliveTriangles,
        Collapses,
    };
}

function TriangleNormal(P) {
    const Ux = P[1][0] - P[0][0], Uy = P[1][1] - P[0][1], Uz = P[1][2] - P[0][2];
    const Vx = P[2][0] - P[0][0], Vy = P[2][1] - P[0][1], Vz = P[2][2] - P[0][2];
    return [Uy * Vz - Uz * Vy, Uz * Vx - Ux * Vz, Ux * Vy - Uy * Vx];
}
