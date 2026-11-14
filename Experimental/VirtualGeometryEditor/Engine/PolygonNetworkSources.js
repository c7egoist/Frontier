// Procedural high-density polygon networks (welded, indexed) plus Wavefront OBJ decoding.
// Every generator returns { Positions: Float32Array, Indices: Uint32Array, Label }.

function ConstructPermutation(Seed) {
    const Permutation = new Uint8Array(512);
    const Base = new Uint8Array(256);
    for (let Index = 0; Index < 256; Index++) Base[Index] = Index;
    let Random = Seed >>> 0 || 1;
    for (let Index = 255; Index > 0; Index--) {
        Random = (Random * 1664525 + 1013904223) >>> 0;
        const Swap = Random % (Index + 1);
        const Held = Base[Index]; Base[Index] = Base[Swap]; Base[Swap] = Held;
    }
    for (let Index = 0; Index < 512; Index++) Permutation[Index] = Base[Index & 255];
    return Permutation;
}

function Fade(T) { return T * T * T * (T * (T * 6 - 15) + 10); }
function Lerp(A, B, T) { return A + (B - A) * T; }
function Gradient(Hash, X, Y, Z) {
    const H = Hash & 15;
    const U = H < 8 ? X : Y;
    const V = H < 4 ? Y : H === 12 || H === 14 ? X : Z;
    return ((H & 1) ? -U : U) + ((H & 2) ? -V : V);
}

export function ConstructGradientNoise(Seed) {
    const P = ConstructPermutation(Seed);
    return function SampleNoise(X, Y, Z) {
        const Xi = Math.floor(X) & 255, Yi = Math.floor(Y) & 255, Zi = Math.floor(Z) & 255;
        X -= Math.floor(X); Y -= Math.floor(Y); Z -= Math.floor(Z);
        const U = Fade(X), V = Fade(Y), W = Fade(Z);
        const A = P[Xi] + Yi, Aa = P[A] + Zi, Ab = P[A + 1] + Zi;
        const B = P[Xi + 1] + Yi, Ba = P[B] + Zi, Bb = P[B + 1] + Zi;
        return Lerp(
            Lerp(Lerp(Gradient(P[Aa], X, Y, Z), Gradient(P[Ba], X - 1, Y, Z), U),
                Lerp(Gradient(P[Ab], X, Y - 1, Z), Gradient(P[Bb], X - 1, Y - 1, Z), U), V),
            Lerp(Lerp(Gradient(P[Aa + 1], X, Y, Z - 1), Gradient(P[Ba + 1], X - 1, Y, Z - 1), U),
                Lerp(Gradient(P[Ab + 1], X, Y - 1, Z - 1), Gradient(P[Bb + 1], X - 1, Y - 1, Z - 1), U), V),
            W);
    };
}

function FractalNoise(Sample, X, Y, Z, Octaves, Lacunarity = 2.03, Gain = 0.5) {
    let Sum = 0, Amplitude = 1, Frequency = 1, Norm = 0;
    for (let Octave = 0; Octave < Octaves; Octave++) {
        Sum += Sample(X * Frequency, Y * Frequency, Z * Frequency) * Amplitude;
        Norm += Amplitude;
        Amplitude *= Gain;
        Frequency *= Lacunarity;
    }
    return Sum / Norm;
}

function RidgedNoise(Sample, X, Y, Z, Octaves) {
    let Sum = 0, Amplitude = 0.5, Frequency = 1, Weight = 1;
    for (let Octave = 0; Octave < Octaves; Octave++) {
        let Signal = 1 - Math.abs(Sample(X * Frequency, Y * Frequency, Z * Frequency));
        Signal *= Signal * Weight;
        Weight = Math.min(1, Math.max(0, Signal * 2));
        Sum += Signal * Amplitude;
        Amplitude *= 0.5;
        Frequency *= 2.1;
    }
    return Sum;
}

// Icosahedron subdivided N times (20·4^N triangles) and displaced into a fractured boulder.
export function ConstructBoulder({ Subdivisions = 6, Seed = 7 } = {}) {
    const T = (1 + Math.sqrt(5)) / 2;
    let Positions = [
        -1, T, 0, 1, T, 0, -1, -T, 0, 1, -T, 0, 0, -1, T, 0, 1, T, 0, -1, -T, 0, 1, -T,
        T, 0, -1, T, 0, 1, -T, 0, -1, -T, 0, 1,
    ];
    let Faces = [
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
        3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    ];
    for (let Index = 0; Index < Positions.length; Index += 3) {
        const L = Math.hypot(Positions[Index], Positions[Index + 1], Positions[Index + 2]);
        Positions[Index] /= L; Positions[Index + 1] /= L; Positions[Index + 2] /= L;
    }
    for (let Level = 0; Level < Subdivisions; Level++) {
        const MidpointLookup = new Map();
        const Next = [];
        const Midpoint = (A, B) => {
            const Key = A < B ? A * 1048576 + B : B * 1048576 + A;
            let Found = MidpointLookup.get(Key);
            if (Found !== undefined) return Found;
            let X = Positions[A * 3] + Positions[B * 3], Y = Positions[A * 3 + 1] + Positions[B * 3 + 1], Z = Positions[A * 3 + 2] + Positions[B * 3 + 2];
            const L = Math.hypot(X, Y, Z);
            Found = Positions.length / 3;
            Positions.push(X / L, Y / L, Z / L);
            MidpointLookup.set(Key, Found);
            return Found;
        };
        for (let Index = 0; Index < Faces.length; Index += 3) {
            const A = Faces[Index], B = Faces[Index + 1], C = Faces[Index + 2];
            const Ab = Midpoint(A, B), Bc = Midpoint(B, C), Ca = Midpoint(C, A);
            Next.push(A, Ab, Ca, B, Bc, Ab, C, Ca, Bc, Ab, Bc, Ca);
        }
        Faces = Next;
    }
    const Sample = ConstructGradientNoise(Seed);
    const Out = new Float32Array(Positions.length);
    for (let Index = 0; Index < Positions.length; Index += 3) {
        const X = Positions[Index], Y = Positions[Index + 1], Z = Positions[Index + 2];
        const Broad = FractalNoise(Sample, X * 1.1 + 3.1, Y * 1.1, Z * 1.1, 3);
        const Ridges = RidgedNoise(Sample, X * 2.6, Y * 2.6 + 7.3, Z * 2.6, 5);
        const Grain = FractalNoise(Sample, X * 18, Y * 18, Z * 18, 3) * 0.018;
        // Planar cleavage: a few fracture planes flatten the silhouette into a fractured stone.
        let Cleave = 0;
        const Plane = [[0.6, 0.7, 0.38], [-0.7, 0.2, 0.68], [0.1, -0.95, 0.3]];
        for (const [Px, Py, Pz] of Plane) {
            const D = X * Px + Y * Py + Z * Pz;
            if (D > 0.62) Cleave -= (D - 0.62) * 0.55;
        }
        let Radius = 1 + Broad * 0.32 + Ridges * 0.16 + Grain + Cleave;
        let Height = Y * Radius;
        if (Height < -0.55) Height = -0.55 + (Height + 0.55) * 0.25; // settled base
        Out[Index] = X * Radius * 1.15;
        Out[Index + 1] = Height * 0.82;
        Out[Index + 2] = Z * Radius;
    }
    return { Label: "Basalt Boulder", Positions: Out, Indices: new Uint32Array(Faces) };
}

// (P, Q) torus knot tube, welded across both seams.
export function ConstructTorusKnot({ TubularSegments = 1024, RadialSegments = 48, P = 2, Q = 3, Radius = 1.4, Tube = 0.36, Seed = 3 } = {}) {
    const Sample = ConstructGradientNoise(Seed);
    const Positions = new Float32Array(TubularSegments * RadialSegments * 3);
    const CurvePoint = (U, Out) => {
        const Qu = (Q / P) * U;
        const Cs = Math.cos(Qu);
        Out[0] = Radius * (2 + Cs) * 0.5 * Math.cos(U);
        Out[1] = Radius * (2 + Cs) * Math.sin(U) * 0.5;
        Out[2] = Radius * Math.sin(Qu) * 0.5;
        return Out;
    };
    const A = [0, 0, 0], B = [0, 0, 0];
    for (let Segment = 0; Segment < TubularSegments; Segment++) {
        const U = (Segment / TubularSegments) * P * Math.PI * 2;
        CurvePoint(U, A);
        CurvePoint(U + 0.01, B);
        let Tx = B[0] - A[0], Ty = B[1] - A[1], Tz = B[2] - A[2];
        let Nx = B[0] + A[0], Ny = B[1] + A[1], Nz = B[2] + A[2];
        let Bx = Ty * Nz - Tz * Ny, By = Tz * Nx - Tx * Nz, Bz = Tx * Ny - Ty * Nx;
        Nx = By * Tz - Bz * Ty; Ny = Bz * Tx - Bx * Tz; Nz = Bx * Ty - By * Tx;
        let L = Math.hypot(Bx, By, Bz); Bx /= L; By /= L; Bz /= L;
        L = Math.hypot(Nx, Ny, Nz); Nx /= L; Ny /= L; Nz /= L;
        for (let Ring = 0; Ring < RadialSegments; Ring++) {
            const V = (Ring / RadialSegments) * Math.PI * 2;
            const Flute = 1 + 0.07 * Math.cos(V * 6 + U * 3) + 0.035 * Sample(Segment * 0.05, Ring * 0.31, 1.7);
            const Cx = -Tube * Flute * Math.cos(V), Cy = Tube * Flute * Math.sin(V);
            const Base = (Segment * RadialSegments + Ring) * 3;
            Positions[Base] = A[0] + (Cx * Nx + Cy * Bx);
            Positions[Base + 1] = A[1] + (Cx * Ny + Cy * By);
            Positions[Base + 2] = A[2] + (Cx * Nz + Cy * Bz);
        }
    }
    const Indices = new Uint32Array(TubularSegments * RadialSegments * 6);
    let Cursor = 0;
    for (let Segment = 0; Segment < TubularSegments; Segment++) {
        const NextSegment = (Segment + 1) % TubularSegments;
        for (let Ring = 0; Ring < RadialSegments; Ring++) {
            const NextRing = (Ring + 1) % RadialSegments;
            const Va = Segment * RadialSegments + Ring;
            const Vb = NextSegment * RadialSegments + Ring;
            const Vc = NextSegment * RadialSegments + NextRing;
            const Vd = Segment * RadialSegments + NextRing;
            Indices[Cursor++] = Va; Indices[Cursor++] = Vb; Indices[Cursor++] = Vd;
            Indices[Cursor++] = Vb; Indices[Cursor++] = Vc; Indices[Cursor++] = Vd;
        }
    }
    return { Label: "Torus Knot", Positions, Indices };
}

// Open heightfield tile (tests open-border preservation in the simplifier).
export function ConstructTerrainTile({ Resolution = 256, Extent = 240, Relief = 26, Seed = 11 } = {}) {
    const Sample = ConstructGradientNoise(Seed);
    const Row = Resolution + 1;
    const Positions = new Float32Array(Row * Row * 3);
    for (let Z = 0; Z <= Resolution; Z++) {
        for (let X = 0; X <= Resolution; X++) {
            const U = X / Resolution - 0.5, V = Z / Resolution - 0.5;
            const Ridge = RidgedNoise(Sample, U * 3.2 + 10, 0.5, V * 3.2, 6);
            const Rolling = FractalNoise(Sample, U * 1.6, 2.5, V * 1.6, 4);
            const Basin = Math.min(1, Math.hypot(U, V) * 2.4);
            const Height = (Ridge * 0.85 * Basin + Rolling * 0.35) * Relief - Relief * 0.18;
            const Base = (Z * Row + X) * 3;
            Positions[Base] = U * Extent;
            Positions[Base + 1] = Height;
            Positions[Base + 2] = V * Extent;
        }
    }
    const Indices = new Uint32Array(Resolution * Resolution * 6);
    let Cursor = 0;
    for (let Z = 0; Z < Resolution; Z++) {
        for (let X = 0; X < Resolution; X++) {
            const A = Z * Row + X, B = A + 1, C = A + Row, D = C + 1;
            if ((X + Z) & 1) {
                Indices[Cursor++] = A; Indices[Cursor++] = C; Indices[Cursor++] = B;
                Indices[Cursor++] = B; Indices[Cursor++] = C; Indices[Cursor++] = D;
            } else {
                Indices[Cursor++] = A; Indices[Cursor++] = C; Indices[Cursor++] = D;
                Indices[Cursor++] = A; Indices[Cursor++] = D; Indices[Cursor++] = B;
            }
        }
    }
    return { Label: "Terrain Tile", Positions, Indices };
}

// Fluted column: lathe profile with 64 flutes, capitals, and a closed base / top.
export function ConstructFlutedColumn({ HeightSegments = 640, RadialSegments = 192, Height = 6, Seed = 5 } = {}) {
    const Sample = ConstructGradientNoise(Seed);
    const ProfileRadius = (T) => {
        // T in 0..1 bottom → top.
        if (T < 0.05) return 0.78;
        if (T < 0.08) return 0.78 - (T - 0.05) / 0.03 * 0.16;
        if (T > 0.95) return 0.8;
        if (T > 0.91) return 0.6 + (T - 0.91) / 0.04 * 0.2;
        return 0.55 - 0.04 * Math.sin(T * Math.PI);
    };
    const Rings = HeightSegments + 1;
    const VertexCount = Rings * RadialSegments + 2;
    const Positions = new Float32Array(VertexCount * 3);
    for (let Ring = 0; Ring < Rings; Ring++) {
        const T = Ring / HeightSegments;
        const Shaft = T > 0.085 && T < 0.905;
        for (let Step = 0; Step < RadialSegments; Step++) {
            const Angle = (Step / RadialSegments) * Math.PI * 2;
            let R = ProfileRadius(T);
            if (Shaft) R -= 0.035 * Math.pow(Math.abs(Math.sin(Angle * 12)), 0.6);
            R += 0.012 * Sample(Math.cos(Angle) * 3, T * 30, Math.sin(Angle) * 3);
            const Base = (Ring * RadialSegments + Step) * 3;
            Positions[Base] = Math.cos(Angle) * R;
            Positions[Base + 1] = T * Height;
            Positions[Base + 2] = Math.sin(Angle) * R;
        }
    }
    const BottomCenter = Rings * RadialSegments, TopCenter = BottomCenter + 1;
    Positions.set([0, 0, 0], BottomCenter * 3);
    Positions.set([0, Height, 0], TopCenter * 3);
    const Indices = [];
    for (let Ring = 0; Ring < HeightSegments; Ring++) {
        for (let Step = 0; Step < RadialSegments; Step++) {
            const NextStep = (Step + 1) % RadialSegments;
            const A = Ring * RadialSegments + Step, B = Ring * RadialSegments + NextStep;
            const C = A + RadialSegments, D = B + RadialSegments;
            Indices.push(A, C, B, B, C, D);
        }
    }
    for (let Step = 0; Step < RadialSegments; Step++) {
        const NextStep = (Step + 1) % RadialSegments;
        Indices.push(BottomCenter, Step, NextStep);
        const TopA = HeightSegments * RadialSegments + Step, TopB = HeightSegments * RadialSegments + NextStep;
        Indices.push(TopCenter, TopB, TopA);
    }
    return { Label: "Fluted Column", Positions, Indices: new Uint32Array(Indices) };
}

// Exact-bit position welding with open addressing; returns remap and welded positions.
export function WeldPositions(Positions, Indices, Tolerance = 0) {
    const VertexCount = Positions.length / 3;
    let Capacity = 1;
    while (Capacity < VertexCount * 2) Capacity <<= 1;
    const Slots = new Int32Array(Capacity).fill(-1);
    const Remap = new Uint32Array(VertexCount);
    const Welded = new Float32Array(Positions.length);
    const Bits = new Uint32Array(3);
    const Scratch = new Float32Array(Bits.buffer);
    let Unique = 0;
    const Quantize = Tolerance > 0 ? 1 / Tolerance : 0;
    for (let Vertex = 0; Vertex < VertexCount; Vertex++) {
        for (let Axis = 0; Axis < 3; Axis++) {
            const Coordinate = Positions[Vertex * 3 + Axis];
            Scratch[Axis] = Quantize ? Math.round(Coordinate * Quantize) / Quantize : Coordinate;
            if (Scratch[Axis] === 0) Scratch[Axis] = 0; // fold −0
        }
        let Hash = (Math.imul(Bits[0], 73856093) ^ Math.imul(Bits[1], 19349663) ^ Math.imul(Bits[2], 83492791)) >>> 0;
        let Slot = Hash & (Capacity - 1);
        for (;;) {
            const Held = Slots[Slot];
            if (Held < 0) {
                Slots[Slot] = Unique;
                Welded[Unique * 3] = Scratch[0]; Welded[Unique * 3 + 1] = Scratch[1]; Welded[Unique * 3 + 2] = Scratch[2];
                Remap[Vertex] = Unique++;
                break;
            }
            if (Welded[Held * 3] === Scratch[0] && Welded[Held * 3 + 1] === Scratch[1] && Welded[Held * 3 + 2] === Scratch[2]) {
                Remap[Vertex] = Held;
                break;
            }
            Slot = (Slot + 1) & (Capacity - 1);
        }
    }
    const OutIndices = new Uint32Array(Indices.length);
    let Cursor = 0;
    for (let Index = 0; Index < Indices.length; Index += 3) {
        const A = Remap[Indices[Index]], B = Remap[Indices[Index + 1]], C = Remap[Indices[Index + 2]];
        if (A === B || B === C || C === A) continue; // drop degenerate triangles
        OutIndices[Cursor++] = A; OutIndices[Cursor++] = B; OutIndices[Cursor++] = C;
    }
    return { Positions: Welded.slice(0, Unique * 3), Indices: OutIndices.slice(0, Cursor), Remap };
}

// Area-weighted smooth vertex normals.
export function DeriveVertexNormals(Positions, Indices) {
    const Normals = new Float32Array(Positions.length);
    for (let Index = 0; Index < Indices.length; Index += 3) {
        const A = Indices[Index] * 3, B = Indices[Index + 1] * 3, C = Indices[Index + 2] * 3;
        const Ux = Positions[B] - Positions[A], Uy = Positions[B + 1] - Positions[A + 1], Uz = Positions[B + 2] - Positions[A + 2];
        const Vx = Positions[C] - Positions[A], Vy = Positions[C + 1] - Positions[A + 1], Vz = Positions[C + 2] - Positions[A + 2];
        const Nx = Uy * Vz - Uz * Vy, Ny = Uz * Vx - Ux * Vz, Nz = Ux * Vy - Uy * Vx;
        for (const V of [A, B, C]) { Normals[V] += Nx; Normals[V + 1] += Ny; Normals[V + 2] += Nz; }
    }
    for (let Index = 0; Index < Normals.length; Index += 3) {
        const L = Math.hypot(Normals[Index], Normals[Index + 1], Normals[Index + 2]) || 1;
        Normals[Index] /= L; Normals[Index + 1] /= L; Normals[Index + 2] /= L;
    }
    return Normals;
}

// Minimal Wavefront OBJ decoder: v / f (polygons fan-triangulated, negative indices supported).
export function DecodeWavefrontText(Text, Label = "Imported OBJ") {
    const Positions = [];
    const Indices = [];
    const Lines = Text.split(/\r?\n/);
    for (const Line of Lines) {
        if (Line.startsWith("v ")) {
            const Parts = Line.trim().split(/\s+/);
            Positions.push(+Parts[1], +Parts[2], +Parts[3]);
        } else if (Line.startsWith("f ")) {
            const Parts = Line.trim().split(/\s+/).slice(1);
            const VertexCount = Positions.length / 3;
            const Corners = Parts.map((Part) => {
                const Raw = parseInt(Part.split("/")[0], 10);
                return Raw < 0 ? VertexCount + Raw : Raw - 1;
            });
            for (let Corner = 1; Corner + 1 < Corners.length; Corner++) Indices.push(Corners[0], Corners[Corner], Corners[Corner + 1]);
        }
    }
    if (Positions.length < 9 || Indices.length < 3) throw new Error("OBJ contains no triangles");
    for (const Index of Indices) if (!(Index >= 0 && Index < Positions.length / 3)) throw new Error("OBJ face index out of range");
    // Normalize to a 2-unit tall bounding box resting at y = 0.
    let MinX = Infinity, MinY = Infinity, MinZ = Infinity, MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
    for (let Index = 0; Index < Positions.length; Index += 3) {
        MinX = Math.min(MinX, Positions[Index]); MaxX = Math.max(MaxX, Positions[Index]);
        MinY = Math.min(MinY, Positions[Index + 1]); MaxY = Math.max(MaxY, Positions[Index + 1]);
        MinZ = Math.min(MinZ, Positions[Index + 2]); MaxZ = Math.max(MaxZ, Positions[Index + 2]);
    }
    const Scale = 2 / Math.max(MaxX - MinX, MaxY - MinY, MaxZ - MinZ, 1e-9);
    const Cx = (MinX + MaxX) / 2, Cz = (MinZ + MaxZ) / 2;
    const Out = new Float32Array(Positions.length);
    for (let Index = 0; Index < Positions.length; Index += 3) {
        Out[Index] = (Positions[Index] - Cx) * Scale;
        Out[Index + 1] = (Positions[Index + 1] - MinY) * Scale;
        Out[Index + 2] = (Positions[Index + 2] - Cz) * Scale;
    }
    const Welded = WeldPositions(Out, new Uint32Array(Indices), 1e-6);
    return { Label, Positions: Welded.Positions, Indices: Welded.Indices };
}

export const SourceGenerators = {
    Boulder: ConstructBoulder,
    TorusKnot: ConstructTorusKnot,
    Terrain: ConstructTerrainTile,
    Column: ConstructFlutedColumn,
};
