/*============================================================================================================================================
                                                    PARTICLESPACECATALOGUE.JS
============================================================================================================================================*/
// Frontier .ParticleSpace Unified Engine:
//   • Sections: .SpawnSource · .Field · .Integration · .Fibre · .Trail · .Revision
//   • Strict 3-Bucket Force Field Physics (Flow [m/s] · Accelerate [m/s²] · Damp [1/s]) — verified by Galileo & terminal velocity laws
//   • 36+ Curated Presets across 8 Categories (Sparks, Weather, Wind-blown, VFX, Molecular LJ / A+B↔C, Swarms, Transitions, Light Fibres)
//   • Real Pairwise Lennard-Jones + Langevin Thermostat + A+B↔C Reactive Chemistry + Boids Flocking + Voxel Transitions + Lightning Web
//   • Deterministic/Shared JS Simulation Kernel consumed identically by Browser WebGL2, Software 3D Fallback & Node Validation

export const MAX_GPU_FIELDS = 16;
export const DOC_REVISION_CAP_BYTES = 215 * 1024 * 1024; // 215 MiB per-document Revision budget

export const Clamp = (V, Lo, Hi) => Math.min(Hi, Math.max(Lo, V));
export const Mix = (A, B, T) => A + (B - A) * T;
export const Lerp3 = (A, B, T) => [Mix(A[0], B[0], T), Mix(A[1], B[1], T), Mix(A[2], B[2], T)];
export const Lerp4 = (A, B, T) => [Mix(A[0], B[0], T), Mix(A[1], B[1], T), Mix(A[2], B[2], T), Mix(A[3], B[3], T)];

export function HexToLinear4(Hex, Alpha = 1)
{
    const Clean = String(Hex || '#ffffff').replace('#', '').padEnd(6, 'f');
    const C = [0, 2, 4].map((I) => parseInt(Clean.slice(I, I + 2), 16) / 255);
    const ToLin = (V) => (V <= 0.04045 ? V / 12.92 : Math.pow((V + 0.055) / 1.055, 2.4));
    return [ToLin(C[0]), ToLin(C[1]), ToLin(C[2]), Alpha];
}

export function Linear3ToHex(Lin)
{
    const ToSrgb = (V) => (V <= 0.0031308 ? V * 12.92 : 1.055 * Math.pow(Clamp(V, 0, 1), 1 / 2.4) - 0.055);
    return '#' + [0, 1, 2].map((I) => Math.round(Clamp(ToSrgb(Lin[I] ?? 1), 0, 1) * 255).toString(16).padStart(2, '0')).join('');
}

let NextTokenNum = 100;
export function IssueToken(Prefix = 'ps')
{
    NextTokenNum++;
    return `${Prefix}-${NextTokenNum.toString(36)}`;
}

// Deterministic fast PRNG for reproducible tests & wave displacement
export function MakeMulberry32(Seed)
{
    let A = (Seed >>> 0) || 1;
    return () => {
        A = (A + 0x6d2b79f5) >>> 0;
        let T = A;
        T = Math.imul(T ^ (T >>> 15), T | 1);
        T ^= T + Math.imul(T ^ (T >>> 7), T | 61);
        return ((T ^ (T >>> 14)) >>> 0) / 4294967296;
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                                  FORCE FIELD TAXONOMY (FLOW [m/s] · ACCELERATE [m/s²] · DAMP [1/s])
//------------------------------------------------------------------------------------------------------------------------

export const Contribution = {
    Flow: 'Flow',
    Accelerate: 'Accelerate',
    Damp: 'Damp'
};

export const FieldReach = {
    Everywhere: 'Everywhere',
    Sphere: 'Sphere',
    Box: 'Box'
};

export const FieldFalloff = {
    None: 'None',
    Linear: 'Linear',
    Smooth: 'Smooth',
    InverseSquare: 'InverseSquare'
};

export const ForceFieldKinds = [
    // FLOW [m/s] — relaxes velocity toward F(p) scaled by particle WindCoupling k
    { Id: 'prevailing', GpuId: 0, Name: 'Prevailing Wind', Give: Contribution.Flow, Reach: FieldReach.Everywhere, Unit: 'm/s', Colour: '#6bc4a6', DefaultStrength: 3.4 },
    { Id: 'gust', GpuId: 1, Name: 'Gust Front', Give: Contribution.Flow, Reach: FieldReach.Sphere, Unit: 'm/s', Colour: '#8fd3c4', DefaultStrength: 5.5 },
    { Id: 'tornado', GpuId: 2, Name: 'Tornado Vortex', Give: Contribution.Flow, Reach: FieldReach.Sphere, Unit: 'm/s', Colour: '#58b8d6', DefaultStrength: 7.2 },
    { Id: 'outflow', GpuId: 3, Name: 'Blast Outflow', Give: Contribution.Flow, Reach: FieldReach.Sphere, Unit: 'm/s', Colour: '#7ae0be', DefaultStrength: 6.5 },
    { Id: 'curl', GpuId: 4, Name: 'Curl Turbulence ∇×ψ', Give: Contribution.Flow, Reach: FieldReach.Sphere, Unit: 'm/s', Colour: '#6ee0d8', DefaultStrength: 3.8 },
    { Id: 'current', GpuId: 5, Name: 'Channel Current', Give: Contribution.Flow, Reach: FieldReach.Box, Unit: 'm/s', Colour: '#4cb5c9', DefaultStrength: 4.5 },

    // ACCELERATE [m/s²] — added straight to velocity independent of WindCoupling (Galilean invariant)
    { Id: 'gravity', GpuId: 6, Name: 'Gravity Field', Give: Contribution.Accelerate, Reach: FieldReach.Everywhere, Unit: 'm/s²', Colour: '#e8c27a', DefaultStrength: 9.81 },
    { Id: 'attract', GpuId: 7, Name: 'Attractor Core', Give: Contribution.Accelerate, Reach: FieldReach.Sphere, Unit: 'm/s²', Colour: '#ffb454', DefaultStrength: 8.5 },
    { Id: 'repel', GpuId: 8, Name: 'Repulsor Deflector', Give: Contribution.Accelerate, Reach: FieldReach.Sphere, Unit: 'm/s²', Colour: '#f48466', DefaultStrength: 8.5 },
    { Id: 'lift', GpuId: 9, Name: 'Thermal Lift', Give: Contribution.Accelerate, Reach: FieldReach.Sphere, Unit: 'm/s²', Colour: '#f0b86b', DefaultStrength: 7.0 },
    { Id: 'magnetic', GpuId: 10, Name: 'Magnetic Dipole', Give: Contribution.Accelerate, Reach: FieldReach.Sphere, Unit: 'm/s²', Colour: '#e396ff', DefaultStrength: 6.0 },
    { Id: 'orbit', GpuId: 11, Name: 'Orbital Swirl Drive', Give: Contribution.Accelerate, Reach: FieldReach.Sphere, Unit: 'm/s²', Colour: '#f7c97e', DefaultStrength: 7.5 },

    // DAMP [1/s] — scales velocity down exponentially
    { Id: 'drag', GpuId: 12, Name: 'Viscous Drag Volume', Give: Contribution.Damp, Reach: FieldReach.Box, Unit: '1/s', Colour: '#b9a3e8', DefaultStrength: 2.8 }
];

export const FieldKindById = Object.fromEntries(ForceFieldKinds.map((K) => [K.Id, K]));

export function ConstructField(KindId, Overrides = {})
{
    const K = FieldKindById[KindId] || ForceFieldKinds[0];
    return {
        Token: IssueToken('fld'),
        Kind: K.Id,
        Name: Overrides.Name || K.Name,
        Enabled: Overrides.Enabled !== false,
        Centre: Overrides.Centre ? [...Overrides.Centre] : [0, 1.5, 0],
        Direction: Overrides.Direction ? [...Overrides.Direction] : (K.Id === 'gravity' ? [0, -1, 0] : [Math.sin(70 * Math.PI / 180), 0, Math.cos(70 * Math.PI / 180)]),
        Bearing: Overrides.Bearing ?? 70,
        Strength: Overrides.Strength ?? K.DefaultStrength,
        Radius: Overrides.Radius ?? 5.5,
        BoxHalf: Overrides.BoxHalf ? [...Overrides.BoxHalf] : [3.2, 2.2, 3.2],
        Reach: Overrides.Reach || K.Reach,
        Falloff: Overrides.Falloff || (K.Reach === FieldReach.Everywhere ? FieldFalloff.None : FieldFalloff.Smooth),
        Swirl: Overrides.Swirl ?? (K.Id === 'orbit' ? 3.5 : K.Id === 'tornado' ? 1.0 : 0),
        RateHz: Overrides.RateHz ?? (K.Id === 'gust' ? 0.35 : 0),
        Swallow: Overrides.Swallow ?? 0,
        TurbScale: Overrides.TurbScale ?? 1.8
    };
}

export function FieldFalloffWeight(Shape, Dist, Radius)
{
    if (Shape === FieldFalloff.None) return 1.0;
    const Span = Math.max(1e-4, Radius);
    const Q = Clamp(Dist / Span, 0, 1);
    if (Q >= 1) return 0;
    if (Shape === FieldFalloff.Linear) return 1 - Q;
    if (Shape === FieldFalloff.InverseSquare) return 1 / (1 + 8 * Q * Q);
    const S = 1 - Q * Q;
    return S * S;
}

function EvalCurlFlow3D(X, Y, Z, Time, Scale)
{
    const S = 1 / Math.max(0.3, Scale);
    const Px = X * S + Time * 0.28;
    const Py = Y * S - Time * 0.14;
    const Pz = Z * S + Time * 0.21;
    // Divergence-free analytical curl of 3D scalar stream potential
    const Vx = Math.cos(Py * 1.7 + Pz * 1.1) - Math.sin(Pz * 1.9 - Px * 0.7);
    const Vy = Math.cos(Pz * 1.5 + Px * 1.3) - Math.sin(Px * 1.6 - Py * 0.9);
    const Vz = Math.cos(Px * 1.8 + Py * 1.2) - Math.sin(Py * 1.4 - Pz * 1.1);
    return [Vx * 0.65, Vy * 0.45, Vz * 0.65];
}

export function ResolveFieldBuckets(Fields, Pos, Time = 0, Options = {})
{
    let FlowX = 0, FlowY = 0, FlowZ = 0;
    let AccX = 0, AccY = 0, AccZ = 0;
    let Damp = 0;
    const Breakdown = Options.IncludeBreakdown ? [] : null;
    const Solo = Options.SoloToken || null;
    const [Px, Py, Pz] = Pos;

    for (const F of Fields)
    {
        if (!F.Enabled || (Solo && F.Token !== Solo)) continue;
        const Meta = FieldKindById[F.Kind];
        if (!Meta) continue;

        const Dx = Px - F.Centre[0];
        const Dy = Py - F.Centre[1];
        const Dz = Pz - F.Centre[2];
        const Dist = Math.hypot(Dx, Dy, Dz);

        let W = 1.0;
        if (F.Reach === FieldReach.Sphere)
        {
            if (Dist > F.Radius) continue;
            W = FieldFalloffWeight(F.Falloff, Dist, F.Radius);
        }
        else if (F.Reach === FieldReach.Box)
        {
            const Bx = Math.max(0.1, F.BoxHalf?.[0] ?? F.Radius);
            const By = Math.max(0.1, F.BoxHalf?.[1] ?? F.Radius);
            const Bz = Math.max(0.1, F.BoxHalf?.[2] ?? F.Radius);
            const Nx = Math.abs(Dx) / Bx;
            const Ny = Math.abs(Dy) / By;
            const Nz = Math.abs(Dz) / Bz;
            const M = Math.max(Nx, Ny, Nz);
            if (M > 1) continue;
            W = F.Falloff === FieldFalloff.None ? 1.0 : (1 - M * M);
        }

        const Mod = F.RateHz > 0 ? (0.55 + 0.45 * Math.sin(Time * F.RateHz * Math.PI * 2 + Dx * 0.35)) : 1.0;
        const S = F.Strength * W * Mod;
        let Fx = 0, Fy = 0, Fz = 0;

        if (F.Kind === 'prevailing' || F.Kind === 'gust' || F.Kind === 'current')
        {
            const Rad = (F.Bearing ?? 70) * Math.PI / 180;
            const Dir = F.Kind === 'current' && F.Direction ? F.Direction : [Math.sin(Rad), 0, Math.cos(Rad)];
            const DL = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1;
            Fx = (Dir[0] / DL) * S;
            Fy = (Dir[1] / DL) * S;
            Fz = (Dir[2] / DL) * S;
        }
        else if (F.Kind === 'tornado')
        {
            const Rxz = Math.hypot(Dx, Dz);
            if (Rxz > 0.04)
            {
                const SwirlK = S * (0.75 + (F.Swirl || 0) * 0.35);
                Fx = (-Dz / Rxz) * SwirlK - (Dx / Rxz) * S * 0.16;
                Fz = (Dx / Rxz) * SwirlK - (Dz / Rxz) * S * 0.16;
                Fy = 0.38 * Math.abs(S);
            }
        }
        else if (F.Kind === 'outflow')
        {
            if (Dist > 0.04)
            {
                Fx = (Dx / Dist) * S;
                Fy = (Dy / Dist) * S * 0.35;
                Fz = (Dz / Dist) * S;
            }
        }
        else if (F.Kind === 'curl')
        {
            const [Cx, Cy, Cz] = EvalCurlFlow3D(Px, Py, Pz, Time, F.TurbScale || 1.8);
            Fx = Cx * S; Fy = Cy * S; Fz = Cz * S;
        }
        else if (F.Kind === 'gravity')
        {
            const Dir = F.Direction || [0, -1, 0];
            const DL = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1;
            Fx = (Dir[0] / DL) * S;
            Fy = (Dir[1] / DL) * S;
            Fz = (Dir[2] / DL) * S;
        }
        else if (F.Kind === 'lift')
        {
            Fx = 0; Fy = S; Fz = 0;
        }
        else if (F.Kind === 'attract' || F.Kind === 'repel' || F.Kind === 'orbit')
        {
            const R = Math.max(0.28, Dist);
            const Sign = F.Kind === 'repel' ? 1 : -1;
            Fx = Sign * (Dx / R) * S;
            Fy = Sign * (Dy / R) * S;
            Fz = Sign * (Dz / R) * S;
            if ((F.Swirl || 0) !== 0 || F.Kind === 'orbit')
            {
                const SwirlMag = (F.Kind === 'orbit' ? Math.max(2.5, F.Swirl || 4.0) : F.Swirl) * W;
                const Rxz = Math.max(0.25, Math.hypot(Dx, Dz));
                Fx += (-Dz / Rxz) * SwirlMag;
                Fz += (Dx / Rxz) * SwirlMag;
            }
        }
        else if (F.Kind === 'magnetic')
        {
            // B-field circulation around dipole + axial Lorentz steering toward equatorial belt
            const R = Math.max(0.32, Dist);
            const R3 = R * R * R;
            const DotM = Dy; // m = (0, 1, 0)
            const Bx = (3 * Dx * DotM / (R * R)) / R;
            const By = (3 * Dy * DotM / (R * R) - 1) / R;
            const Bz = (3 * Dz * DotM / (R * R)) / R;
            const Scale = S * Math.min(3.5, 1.2 / Math.max(0.25, R3 * 0.12));
            Fx = Bx * Scale + (-Dz / Math.max(0.25, Math.hypot(Dx, Dz))) * S * 0.45;
            Fy = By * Scale;
            Fz = Bz * Scale + (Dx / Math.max(0.25, Math.hypot(Dx, Dz))) * S * 0.45;
        }
        else if (F.Kind === 'drag')
        {
            Damp += Math.max(0, S);
        }

        if (Meta.Give === Contribution.Flow) { FlowX += Fx; FlowY += Fy; FlowZ += Fz; }
        else if (Meta.Give === Contribution.Accelerate) { AccX += Fx; AccY += Fy; AccZ += Fz; }

        if (Breakdown)
        {
            const Mag = Meta.Give === Contribution.Damp ? Math.max(0, S) : Math.hypot(Fx, Fy, Fz);
            if (Mag > 1e-4) Breakdown.push({ Name: F.Name, Kind: F.Kind, Give: Meta.Give, Mag, Unit: Meta.Unit });
        }
    }

    return { Flow: [FlowX, FlowY, FlowZ], Acc: [AccX, AccY, AccZ], Damp, Breakdown };
}

// Authoritative Flow vs Accelerate vs Damp velocity update:
//   - Flow is relaxed toward using WindCoupling (m/s)
//   - Accelerate is applied straight to velocity independently of WindCoupling (Galileo law)
//   - Damp exponentially damps kinetic velocity
export function AdvanceVelocityByFields(Vel, Buckets, WindCoupling, Drag, Buoyancy, Dt)
{
    let Vx = Vel[0], Vy = Vel[1], Vz = Vel[2];
    if (WindCoupling > 0)
    {
        const Relax = 1 - Math.exp(-WindCoupling * Dt);
        Vx += (Buckets.Flow[0] - Vx) * Relax;
        Vy += (Buckets.Flow[1] - Vy) * Relax;
        Vz += (Buckets.Flow[2] - Vz) * Relax;
    }
    Vx += Buckets.Acc[0] * Dt;
    Vy += (Buckets.Acc[1] + Buoyancy) * Dt;
    Vz += Buckets.Acc[2] * Dt;

    const Decay = Math.exp(-Math.max(0, Drag + Buckets.Damp) * Dt);
    return [Vx * Decay, Vy * Decay, Vz * Decay];
}

export function PackFieldsForGPU(Scene)
{
    const A = new Float32Array(MAX_GPU_FIELDS * 4);
    const B = new Float32Array(MAX_GPU_FIELDS * 4);
    const C = new Float32Array(MAX_GPU_FIELDS * 4);
    let Count = 0;
    const Solo = Scene?.Viz?.SoloToken || null;

    for (const F of (Scene?.Fields || []))
    {
        if (Count >= MAX_GPU_FIELDS) break;
        if (!F.Enabled || (Solo && F.Token !== Solo)) continue;
        const Meta = FieldKindById[F.Kind];
        if (!Meta) continue;
        const I4 = Count * 4;
        const Rad = (F.Bearing ?? 70) * Math.PI / 180;
        const Dir = (F.Kind === 'gravity' || F.Kind === 'current') && F.Direction
            ? F.Direction
            : [Math.sin(Rad), 0, Math.cos(Rad)];
        const DL = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1;
        const ReachCode = F.Reach === FieldReach.Everywhere ? 0 : F.Reach === FieldReach.Box ? 2 : 1;
        const GiveCode = Meta.Give === Contribution.Flow ? 0 : Meta.Give === Contribution.Accelerate ? 1 : 2;

        A[I4] = F.Centre[0]; A[I4 + 1] = F.Centre[1]; A[I4 + 2] = F.Centre[2]; A[I4 + 3] = F.Radius;
        B[I4] = Dir[0] / DL; B[I4 + 1] = Dir[1] / DL; B[I4 + 2] = Dir[2] / DL; B[I4 + 3] = F.Strength;
        C[I4] = Meta.GpuId; C[I4 + 1] = GiveCode + ReachCode * 4; C[I4 + 2] = F.Swirl || 0; C[I4 + 3] = F.BoxHalf?.[0] || F.Radius;
        Count++;
    }
    return { Count, A, B, C };
}

//------------------------------------------------------------------------------------------------------------------------
//                                  PARTICLE KINDS, SHAPES, FIBRES & 38+ PRESETS
//------------------------------------------------------------------------------------------------------------------------

export const ParticleKind = {
    Ballistic: 0,    // Sparks, rain, hail, debris, coins
    WindFlutter: 1,  // Leaves, paper, petals, feathers, confetti, sandstorm
    AtomsLJ: 3,      // Lennard-Jones 12-6 potential + Langevin thermostat
    ChemicalsABC: 4, // Reactive A + B <-> C chemical bath
    VfxTransition: 5,// Fire, smoke, black hole, voxel transitions (derez, melt, butterflies, glitch)
    SwarmBoids: 6,   // Flocking fireflies / insects
    LightFibre: 7    // Analytic parametric streaks, ribbons & closed path trails
};

export const ParticleShapeCode = {
    Streak: 0,
    Sphere: 1,
    Leaf: 2,
    SoftGlow: 3,
    VoxelCube: 4,
    CoinDisc: 5,
    Bubble: 6,
    Butterfly: 7
};

export const FIBRE_PATHS = ['Ring', 'Figure eight', 'Rose', 'Weave', 'Loop', 'Stadium', 'Dipole field line'];
export const FIBRE_SHAPES = ['streak', 'ribbon', 'trail', 'blossom', 'stream', 'burst', 'curl', 'void'];
export const PULSE_SHAPES = ['Breathe', 'Heartbeat', 'Ripple', 'Sweep'];

export const KindLabel = {
    0: 'Ballistic · Streak',
    1: 'Wind-Driven Flutter',
    3: 'Molecular · Lennard-Jones',
    4: 'Reactive · A+B⇌C',
    5: 'Volumetric VFX & Transition',
    6: 'Swarm · Flocking Boids',
    7: 'Analytic Light Fibre'
};

export function BaseFibreParams(Overrides = {})
{
    return {
        Shape: 'streak',
        Strands: 72,
        Segments: 48,
        Seed: 11,
        LoopSeconds: 10,
        Scale: 1.0,
        Length: 6.0,
        Spread: 0.9,
        Amplitude: 1.6,
        Frequency: 1.1,
        SheetWidth: 3.4,
        Ripple: 1.2,
        Waves: 0.85,
        PhaseSpread: 1.35,
        TrailLength: 0.32,
        PathShape: 'Ring',
        PathSize: 3.4,
        Window: 0.55,
        Thickness: 1.5,
        Intensity: 1.2,
        PulseRate: 1.0,
        PulseDepth: 0.35,
        PulseShape: 'Breathe',
        ...Overrides
    };
}

export function BaseTrailParams(Overrides = {})
{
    return {
        Enabled: false,
        Segments: 10,
        Width: 0.032,
        FadePower: 1.3,
        ...Overrides
    };
}

export function BaseTransitionParams(Overrides = {})
{
    return {
        Wave: 'corner',     // 'corner' | 'melt' | 'glitch'
        Assemble: 0,        // 0 = derez/dissolve, 1 = reverse assemble
        HoldBase: 0.4,
        HoldSpread: 1.6,
        BurstShare: 0.5,
        Fragment: false,
        After: 'none',      // 'none' | 'butterfly'
        ...Overrides
    };
}

export function BaseEmitter(Overrides = {})
{
    const Origin = Overrides.Origin ? [...Overrides.Origin] : [0, 0.8, 0];
    const Dir = Overrides.Dir ? [...Overrides.Dir] : [0, 1, 0];
    const ColA = Overrides.ColA ? [...Overrides.ColA] : HexToLinear4('#ffdf78', 1);
    const ColB = Overrides.ColB ? [...Overrides.ColB] : HexToLinear4('#ff661a', 0);
    const ColC = Overrides.ColC ? [...Overrides.ColC] : [1, 1, 0.9, 1];
    return {
        Token: Overrides.Token || IssueToken('src'),
        PresetId: Overrides.PresetId || 'sparks',
        Name: Overrides.Name || 'Sparks Emitter',
        Group: Overrides.Group || 'Effects',
        Kind: Overrides.Kind ?? 0,
        Shape: Overrides.Shape ?? 0,
        Blend: Overrides.Blend || 'add',
        Enabled: Overrides.Enabled !== false,
        Capacity: Overrides.Capacity ?? 1200,
        Rate: Overrides.Rate ?? 140,
        BurstEvery: Overrides.BurstEvery ?? 0,
        BurstCount: Overrides.BurstCount ?? 120,
        BurstAtOrigin: Overrides.BurstAtOrigin !== false,
        EmitShape: Overrides.EmitShape ?? 0, // 0 Point, 1 Sphere, 2 Disc, 3 Box, 4 VoxelSurface
        Origin,
        Radius: Overrides.Radius ?? 0.35,
        BoxHalf: Overrides.BoxHalf ? [...Overrides.BoxHalf] : [0.6, 0.6, 0.6],
        Dir,
        Spread: Overrides.Spread ?? 0.55,
        SpeedMin: Overrides.SpeedMin ?? 2.0,
        SpeedMax: Overrides.SpeedMax ?? 5.5,
        Drag: Overrides.Drag ?? 0.45,
        GravityScale: Overrides.GravityScale ?? 1.0,
        Buoyancy: Overrides.Buoyancy ?? 0,
        WindCoupling: Overrides.WindCoupling ?? 0.3,
        Bounce: Overrides.Bounce ?? 0.35,
        Flutter: Overrides.Flutter ?? 0,
        LifeMin: Overrides.LifeMin ?? 0.7,
        LifeMax: Overrides.LifeMax ?? 1.6,
        SizeStart: Overrides.SizeStart ?? 0.055,
        SizeEnd: Overrides.SizeEnd ?? 0.015,
        SizeScale: Overrides.SizeScale ?? 1.0,
        ColA,
        ColB,
        ColC,
        // Molecular physics
        Temperature: Overrides.Temperature ?? 0.65,
        Epsilon: Overrides.Epsilon ?? 0.16,
        Sigma: Overrides.Sigma ?? 0.22,
        LangevinDamp: Overrides.LangevinDamp ?? 1.8,
        ReactRate: Overrides.ReactRate ?? 6.0,
        Dissociation: Overrides.Dissociation ?? 0.35,
        ReactRadius: Overrides.ReactRadius ?? 0.34,
        FracA: Overrides.FracA ?? 0.5,
        // Swarm physics
        SwarmRadius: Overrides.SwarmRadius ?? 2.0,
        PulseHz: Overrides.PulseHz ?? 0.9,
        PulseDepth: Overrides.PulseDepth ?? 0.8,
        // Sub-structs mapping cleanly to .ParticleSpace (.Trail, .Fibre, Transition)
        Trail: BaseTrailParams(Overrides.Trail),
        Fibre: Overrides.Fibre ? BaseFibreParams(Overrides.Fibre) : null,
        Transition: Overrides.Transition ? BaseTransitionParams(Overrides.Transition) : null,
        Attractor: Overrides.Attractor ? { ...Overrides.Attractor } : null,
        MagneticGuide: Overrides.MagneticGuide ? { ...Overrides.MagneticGuide } : null,
        OnStrikeBurst: Boolean(Overrides.OnStrikeBurst)
    };
}

export const EmitterPresets = [
    // Effects & Weather
    { Id: 'sparks', Name: 'Hot Sparks', Group: 'Effects', Blurb: 'High-energy metal sparks with directional velocity streaks, ribbons & ground bounce.', Config: { Kind: 0, Shape: 0, Blend: 'add', Capacity: 1400, Rate: 150, Origin: [-2.8, 0.35, 0.2], Dir: [0.15, 1, 0], Spread: 0.62, SpeedMin: 2.8, SpeedMax: 6.4, Drag: 0.42, GravityScale: 0.9, Bounce: 0.42, WindCoupling: 0.28, LifeMin: 0.65, LifeMax: 1.5, SizeStart: 0.055, SizeEnd: 0.015, ColA: HexToLinear4('#ffeb8a', 1), ColB: HexToLinear4('#ff5412', 0), Trail: { Enabled: true, Segments: 9, Width: 0.024 } } },
    { Id: 'strikeSparks', Name: 'Strike Sparks', Group: 'Effects', Blurb: 'Electric arc burst triggered automatically when lightning strikes ground.', Config: { Kind: 0, Shape: 0, Blend: 'add', Capacity: 900, Rate: 0, BurstEvery: 0, BurstCount: 140, OnStrikeBurst: true, Origin: [0, 0.1, 0], Dir: [0, 1, 0], Spread: 1.45, SpeedMin: 2.2, SpeedMax: 7.5, Drag: 0.35, GravityScale: 1.1, Bounce: 0.45, WindCoupling: 0.25, LifeMin: 0.45, LifeMax: 1.15, SizeStart: 0.055, SizeEnd: 0.012, ColA: HexToLinear4('#dcf0ff', 1), ColB: HexToLinear4('#4d8cff', 0), Trail: { Enabled: true, Segments: 8, Width: 0.02 } } },
    { Id: 'glass', Name: 'Glass Shards', Group: 'Effects', Blurb: 'Specular glinting shards scattering radially across the floor.', Config: { Kind: 0, Shape: 0, Blend: 'add', Capacity: 700, Rate: 45, EmitShape: 1, Radius: 0.4, Origin: [2.6, 2.4, -2.5], Dir: [-0.3, 0.1, 0.9], Spread: 0.95, SpeedMin: 2.2, SpeedMax: 5.0, Drag: 0.15, GravityScale: 0.95, Bounce: 0.38, LifeMin: 1.8, LifeMax: 3.2, SizeStart: 0.06, SizeEnd: 0.03, ColA: HexToLinear4('#ccf5ff', 1), ColB: HexToLinear4('#6eb4ff', 0) } },
    { Id: 'fireworks', Name: 'Firework Shells', Group: 'Effects', Blurb: 'Periodic altitude bursts with glowing ballistic trails.', Config: { Kind: 5, Shape: 0, Blend: 'add', Capacity: 1800, Rate: 0, BurstEvery: 2.4, BurstCount: 160, BurstAtOrigin: false, EmitShape: 1, Radius: 0.15, Origin: [0, 5.2, 0], Dir: [0, 1, 0], Spread: 3.14, SpeedMin: 3.5, SpeedMax: 7.2, Drag: 1.6, GravityScale: 0.65, LifeMin: 1.2, LifeMax: 2.2, SizeStart: 0.075, SizeEnd: 0.02, ColA: HexToLinear4('#ffe58c', 1), ColB: HexToLinear4('#ff4824', 0), WindCoupling: 0.35, Trail: { Enabled: true, Segments: 12, Width: 0.028 } } },
    { Id: 'rain', Name: 'Rain Streaks', Group: 'Weather', Blurb: 'Wind-tilted rainfall with ground splash rebounds.', Config: { Kind: 0, Shape: 0, Blend: 'alpha', Capacity: 2200, Rate: 380, EmitShape: 3, BoxHalf: [4.8, 0.1, 4.8], Origin: [0, 6.8, 0], Dir: [0, -1, 0], Spread: 0.04, SpeedMin: 7.5, SpeedMax: 9.8, Drag: 0.05, GravityScale: 0.6, Bounce: 0.25, WindCoupling: 0.72, LifeMin: 0.9, LifeMax: 1.4, SizeStart: 0.065, SizeEnd: 0.045, ColA: HexToLinear4('#bfd9ff', 0.85), ColB: HexToLinear4('#8cb8ff', 0.2) } },
    { Id: 'snow', Name: 'Snowfall', Group: 'Weather', Blurb: 'Slow drifting snowflakes swaying on curl wind currents.', Config: { Kind: 1, Shape: 3, Blend: 'alpha', Capacity: 1500, Rate: 120, EmitShape: 3, BoxHalf: [4.8, 0.1, 4.8], Origin: [0, 6.6, 0], Dir: [0, -1, 0], Spread: 0.25, SpeedMin: 0.4, SpeedMax: 0.9, Drag: 1.1, GravityScale: 0.15, WindCoupling: 1.6, Flutter: 0.9, Bounce: 0.08, LifeMin: 6.0, LifeMax: 9.0, SizeStart: 0.09, SizeEnd: 0.07, ColA: HexToLinear4('#f2f7ff', 0.85), ColB: HexToLinear4('#dce9ff', 0) } },
    { Id: 'hail', Name: 'Hail Pellets', Group: 'Weather', Blurb: 'Hard ice pellets rebounding steeply off the floor plane.', Config: { Kind: 0, Shape: 1, Blend: 'alpha', Capacity: 1000, Rate: 90, EmitShape: 3, BoxHalf: [4.5, 0.1, 4.5], Origin: [0, 6.8, 0], Dir: [0, -1, 0], Spread: 0.06, SpeedMin: 6.2, SpeedMax: 8.6, Drag: 0.05, GravityScale: 1.0, Bounce: 0.56, WindCoupling: 0.5, LifeMin: 2.2, LifeMax: 3.4, SizeStart: 0.08, SizeEnd: 0.07, ColA: HexToLinear4('#e5f2ff', 1), ColB: HexToLinear4('#a8c4e8', 0.15) } },

    // Wind-Blown
    { Id: 'leaves', Name: 'Canopy Leaves', Group: 'Wind-blown', Blurb: 'Autumn foliage fluttering, tumbling & riding spatial flow currents.', Config: { Kind: 1, Shape: 2, Blend: 'alpha', Capacity: 900, Rate: 28, EmitShape: 2, Origin: [0, 4.4, 0], Radius: 4.0, Dir: [0, -1, 0], Spread: 0.55, SpeedMin: 0.25, SpeedMax: 0.95, Drag: 1.35, GravityScale: 0.25, WindCoupling: 2.4, Flutter: 1.4, LifeMin: 5.5, LifeMax: 9.0, SizeStart: 0.17, SizeEnd: 0.15, ColA: HexToLinear4('#7bc244', 1), ColB: HexToLinear4('#d97d26', 0.85) } },
    { Id: 'petals', Name: 'Cherry Petals', Group: 'Wind-blown', Blurb: 'Soft blossoms swirling across wind fields with gentle flutter.', Config: { Kind: 1, Shape: 2, Blend: 'alpha', Capacity: 750, Rate: 26, EmitShape: 2, Origin: [2.2, 4.2, 1.8], Radius: 2.4, Dir: [0, -1, 0], Spread: 0.5, SpeedMin: 0.2, SpeedMax: 0.7, Drag: 1.4, GravityScale: 0.2, WindCoupling: 2.8, Flutter: 1.7, LifeMin: 5.5, LifeMax: 8.5, SizeStart: 0.14, SizeEnd: 0.12, ColA: HexToLinear4('#ffb8cf', 1), ColB: HexToLinear4('#f57da6', 0.85) } },
    { Id: 'confetti', Name: 'Confetti Streamers', Group: 'Wind-blown', Blurb: 'Multi-hued fluttering sheets caught in high-coupling airflow.', Config: { Kind: 1, Shape: 2, Blend: 'alpha', Capacity: 900, Rate: 45, EmitShape: 1, Radius: 0.5, Origin: [0, 0.4, -0.8], Dir: [0, 1, 0], Spread: 0.85, SpeedMin: 1.4, SpeedMax: 3.6, Drag: 0.9, GravityScale: 0.22, WindCoupling: 3.2, Flutter: 2.1, LifeMin: 4.5, LifeMax: 7.5, SizeStart: 0.14, SizeEnd: 0.12, ColA: HexToLinear4('#ffd14d', 1), ColB: HexToLinear4('#ff5499', 0.9) } },
    { Id: 'tornadoDebris', Name: 'Tornado Debris', Group: 'Wind-blown', Blurb: 'Lifted twigs & sheets spiraling inside tornado updraft vortices.', Config: { Kind: 1, Shape: 2, Blend: 'alpha', Capacity: 1100, Rate: 95, EmitShape: 2, Origin: [0, 0.1, 0], Radius: 1.8, Dir: [0, 1, 0], Spread: 0.65, SpeedMin: 1.0, SpeedMax: 3.0, Drag: 0.45, GravityScale: 0.28, WindCoupling: 3.8, Flutter: 1.3, LifeMin: 3.6, LifeMax: 6.2, SizeStart: 0.16, SizeEnd: 0.11, ColA: HexToLinear4('#78634f', 1), ColB: HexToLinear4('#a89278', 0) } },
    { Id: 'seeds', Name: 'Dandelion Seeds', Group: 'Wind-blown', Blurb: 'Feather-light seeds carried far across horizontal wind currents.', Config: { Kind: 1, Shape: 3, Blend: 'alpha', Capacity: 480, Rate: 18, EmitShape: 1, Radius: 0.7, Origin: [-2.8, 2.0, 2.4], Dir: [0, 1, 0], Spread: 0.7, SpeedMin: 0.1, SpeedMax: 0.45, Drag: 1.5, GravityScale: 0.06, WindCoupling: 3.4, Flutter: 1.5, LifeMin: 6.0, LifeMax: 9.5, SizeStart: 0.075, SizeEnd: 0.06, ColA: HexToLinear4('#fffdf0', 0.9), ColB: HexToLinear4('#ffffff', 0) } },

    // VFX & Water
    { Id: 'fire', Name: 'Buoyant Flame', Group: 'VFX', Blurb: 'Hot additive fire plume rising on upward thermal buoyancy.', Config: { Kind: 5, Shape: 3, Blend: 'add', Capacity: 1400, Rate: 220, EmitShape: 1, Radius: 0.18, Origin: [-3.2, 0.15, -3.2], Dir: [0, 1, 0], Spread: 0.35, SpeedMin: 0.6, SpeedMax: 1.7, Drag: 0.8, GravityScale: 0, Buoyancy: 2.8, WindCoupling: 1.3, LifeMin: 0.65, LifeMax: 1.35, SizeStart: 0.42, SizeEnd: 0.12, ColA: HexToLinear4('#ffd858', 1), ColB: HexToLinear4('#f2330c', 0) } },
    { Id: 'smoke', Name: 'Dense Smoke Plume', Group: 'VFX', Blurb: 'Expanding volumetric smoke drifting cleanly in prevailing wind.', Config: { Kind: 5, Shape: 3, Blend: 'alpha', Capacity: 900, Rate: 60, EmitShape: 1, Radius: 0.24, Origin: [-2.2, 0.25, -3.2], Dir: [0, 1, 0], Spread: 0.3, SpeedMin: 0.3, SpeedMax: 0.85, Drag: 0.55, GravityScale: 0, Buoyancy: 1.2, WindCoupling: 1.6, LifeMin: 2.8, LifeMax: 5.4, SizeStart: 0.28, SizeEnd: 1.35, ColA: HexToLinear4('#8d9099', 0.55), ColB: HexToLinear4('#36383e', 0) } },
    { Id: 'embers', Name: 'Glowing Embers', Group: 'VFX', Blurb: 'Buoyant glowing sparks lifted skyward from combustion beds.', Config: { Kind: 5, Shape: 3, Blend: 'add', Capacity: 700, Rate: 48, EmitShape: 1, Radius: 0.55, Origin: [-3.2, 0.3, -3.2], Dir: [0, 1, 0], Spread: 0.5, SpeedMin: 0.7, SpeedMax: 2.1, Drag: 0.7, GravityScale: 0, Buoyancy: 1.8, WindCoupling: 1.6, LifeMin: 2.0, LifeMax: 4.0, SizeStart: 0.055, SizeEnd: 0.018, ColA: HexToLinear4('#ffb84d', 1), ColB: HexToLinear4('#e63c0c', 0) } },
    { Id: 'steam', Name: 'Steam Vent', Group: 'VFX', Blurb: 'Pressurized hot steam cone cooling into soft dispersing clouds.', Config: { Kind: 5, Shape: 3, Blend: 'alpha', Capacity: 950, Rate: 72, EmitShape: 2, Radius: 0.3, Origin: [3.2, 0.1, 3.2], Dir: [0, 1, 0], Spread: 0.14, SpeedMin: 0.9, SpeedMax: 1.7, Drag: 1.4, GravityScale: 0, Buoyancy: 1.6, WindCoupling: 1.3, LifeMin: 2.4, LifeMax: 4.4, SizeStart: 0.22, SizeEnd: 1.4, ColA: HexToLinear4('#e8f0f5', 0.48), ColB: HexToLinear4('#b8c4cc', 0) } },
    { Id: 'explosion', Name: 'Spherical Detonation', Group: 'VFX', Blurb: 'Periodic radial shockwave fireball with sharp deceleration drag.', Config: { Kind: 5, Shape: 3, Blend: 'add', Capacity: 1200, Rate: 0, BurstEvery: 3.4, BurstCount: 240, BurstAtOrigin: true, EmitShape: 1, Radius: 0.15, Origin: [0, 1.4, -2.8], Dir: [0, 1, 0], Spread: 3.14, SpeedMin: 3.5, SpeedMax: 8.5, Drag: 2.4, GravityScale: 0.25, Buoyancy: 0.8, LifeMin: 0.65, LifeMax: 1.3, SizeStart: 0.24, SizeEnd: 0.85, ColA: HexToLinear4('#fff2b2', 1), ColB: HexToLinear4('#ff5914', 0) } },
    { Id: 'flares', Name: 'Decoy Flares', Group: 'VFX', Blurb: 'Dispensed countermeasure flares leaving thick luminous exhaust trails.', Config: { Kind: 5, Shape: 3, Blend: 'add', Capacity: 500, Rate: 0, BurstEvery: 1.1, BurstCount: 10, BurstAtOrigin: true, EmitShape: 1, Radius: 0.25, Origin: [3.8, 4.2, -3.2], Dir: [-1, -0.25, 0], Spread: 0.38, SpeedMin: 3.8, SpeedMax: 6.8, Drag: 1.3, GravityScale: 0.85, LifeMin: 3.0, LifeMax: 4.8, SizeStart: 0.36, SizeEnd: 0.1, ColA: HexToLinear4('#fffbe0', 1), ColB: HexToLinear4('#ff6c1a', 0), Trail: { Enabled: true, Segments: 16, Width: 0.055 } } },
    { Id: 'bubbles', Name: 'Soap Bubbles', Group: 'Water', Blurb: 'Iridescent Fresnel spheres rising on buoyancy with lateral sway.', Config: { Kind: 0, Shape: 6, Blend: 'alpha', Capacity: 360, Rate: 24, EmitShape: 2, Radius: 0.9, Origin: [0, 0.25, 0], Dir: [0, 1, 0], Spread: 0.28, SpeedMin: 0.2, SpeedMax: 0.65, Drag: 0.2, GravityScale: 0, Buoyancy: 1.35, Flutter: 0.65, WindCoupling: 0.85, LifeMin: 4.5, LifeMax: 7.5, SizeStart: 0.16, SizeEnd: 0.26, ColA: HexToLinear4('#bfe9ff', 1), ColB: HexToLinear4('#f0fbff', 0.9) } },
    { Id: 'watermist', Name: 'Waterfall Mist', Group: 'Water', Blurb: 'Fine airborne mist blown outward by horizontal jets.', Config: { Kind: 5, Shape: 3, Blend: 'alpha', Capacity: 1200, Rate: 140, EmitShape: 2, Radius: 0.55, Origin: [4.2, 2.8, 0], Dir: [-1, -0.1, 0], Spread: 0.85, SpeedMin: 0.5, SpeedMax: 1.5, Drag: 2.2, GravityScale: 0.15, WindCoupling: 1.1, LifeMin: 1.2, LifeMax: 2.2, SizeStart: 0.14, SizeEnd: 0.68, ColA: HexToLinear4('#d9ecff', 0.38), ColB: HexToLinear4('#e6f2ff', 0) } },

    // Molecular Physics (Lennard-Jones & Reactive Chemistry)
    { Id: 'atoms', Name: 'Atoms (LJ Gas)', Group: 'Physics', Blurb: 'Real pairwise Lennard-Jones 12-6 potential + Langevin thermostat (colour encodes speed).', Config: { Kind: 3, Shape: 1, Blend: 'alpha', Capacity: 360, Rate: 0, EmitShape: 3, Origin: [2.8, 1.2, -2.4], BoxHalf: [1.1, 1.0, 1.1], Temperature: 0.72, Epsilon: 0.22, Sigma: 0.24, LangevinDamp: 1.6, SizeStart: 0.13, SizeEnd: 0.13, WindCoupling: 0, GravityScale: 0, ColA: HexToLinear4('#5ca8ff', 1), ColB: HexToLinear4('#ff5436', 1) } },
    { Id: 'chemicals', Name: 'Chemicals A+B⇌C', Group: 'Physics', Blurb: 'Pairwise contact reaction A + B → C dimer with reversible thermal dissociation.', Config: { Kind: 4, Shape: 1, Blend: 'alpha', Capacity: 360, Rate: 0, EmitShape: 3, Origin: [2.8, 1.2, 2.4], BoxHalf: [1.1, 1.0, 1.1], Temperature: 0.68, Epsilon: 0.16, Sigma: 0.22, LangevinDamp: 1.8, ReactRate: 6.5, Dissociation: 0.38, ReactRadius: 0.34, FracA: 0.5, SizeStart: 0.13, SizeEnd: 0.13, WindCoupling: 0, GravityScale: 0, ColA: HexToLinear4('#ff614d', 1), ColB: HexToLinear4('#4d9eff', 1), ColC: HexToLinear4('#ffdb4d', 1) } },
    { Id: 'magneticParticles', Name: 'Magnetic Plasma', Group: 'Fields', Blurb: 'Charged plasma stream guided cleanly along magnetic dipole field lines.', Config: { Kind: 0, Shape: 3, Blend: 'add', Capacity: 950, Rate: 180, EmitShape: 1, Radius: 1.8, Origin: [0, 1.5, 0], Dir: [0, 1, 0], Spread: 0.3, SpeedMin: 0.2, SpeedMax: 0.9, Drag: 0.25, GravityScale: 0, WindCoupling: 0, LifeMin: 4.5, LifeMax: 7.5, SizeStart: 0.085, SizeEnd: 0.04, ColA: HexToLinear4('#ff914d', 1), ColB: HexToLinear4('#ffe0a6', 0), MagneticGuide: { Strength: 4.2, Radius: 5.5 }, Trail: { Enabled: true, Segments: 10, Width: 0.02 } } },
    { Id: 'blackhole', Name: 'Black Hole Accretion', Group: 'Space', Blurb: 'Relativistic accretion disc spiraling inward toward an event horizon.', Config: { Kind: 5, Shape: 3, Blend: 'add', Capacity: 1800, Rate: 260, EmitShape: 2, Radius: 2.8, Origin: [0, 2.2, 0], Dir: [0, 1, 0], Spread: 0.08, SpeedMin: 0.1, SpeedMax: 0.4, Drag: 0.15, GravityScale: 0, WindCoupling: 0, LifeMin: 4.5, LifeMax: 7.5, SizeStart: 0.09, SizeEnd: 0.025, ColA: HexToLinear4('#ffd08a', 1), ColB: HexToLinear4('#ff5412', 0), Attractor: { Strength: 9.5, Swirl: 4.8, Horizon: 0.48 }, Trail: { Enabled: true, Segments: 9, Width: 0.022 } } },

    // Swarms & Flocking
    { Id: 'fireflies', Name: 'Fireflies Swarm', Group: 'Ambient', Blurb: 'Bioluminescent pulsing fireflies steering by Boids cohesion & gentle wander.', Config: { Kind: 6, Shape: 3, Blend: 'add', Capacity: 180, Rate: 18, EmitShape: 3, BoxHalf: [3.6, 1.2, 3.6], Origin: [0, 1.5, 0], Dir: [0, 1, 0], Spread: 0.6, SpeedMin: 0.35, SpeedMax: 1.0, Drag: 0.4, GravityScale: 0, WindCoupling: 0.28, Flutter: 0.6, SwarmRadius: 2.0, PulseHz: 0.9, PulseDepth: 0.88, LifeMin: 10, LifeMax: 16, SizeStart: 0.11, SizeEnd: 0.08, ColA: HexToLinear4('#b8ff4d', 1), ColB: HexToLinear4('#7de633', 0.25) } },
    { Id: 'insects', Name: 'Boids Insect Swarm', Group: 'Ambient', Blurb: 'Tight separation/alignment/cohesion boids swarm orbiting dynamically.', Config: { Kind: 6, Shape: 1, Blend: 'alpha', Capacity: 280, Rate: 36, EmitShape: 3, BoxHalf: [2.4, 1.0, 2.4], Origin: [-1.8, 1.9, 1.8], Dir: [0, 1, 0], Spread: 0.5, SpeedMin: 0.9, SpeedMax: 2.2, Drag: 0.35, GravityScale: 0, WindCoupling: 0.4, Flutter: 1.2, SwarmRadius: 1.6, PulseHz: 0, PulseDepth: 0, LifeMin: 12, LifeMax: 20, SizeStart: 0.06, SizeEnd: 0.055, ColA: HexToLinear4('#ccb899', 1), ColB: HexToLinear4('#857865', 0.65) } },

    // Transitions (Voxel Cubes / Coins / Melt / Butterflies / Glitch)
    { Id: 'derez-cube', Name: 'Derez Cube', Group: 'Transitions', Blurb: 'Lattice of surface voxels releases in a sweeping corner wave and bursts/falls.', Config: { Kind: 5, Shape: 4, Blend: 'alpha', Capacity: 512, Rate: 0, BurstEvery: 6.5, BurstCount: 512, EmitShape: 4, Origin: [0, 1.1, 0], BoxHalf: [0.8, 0.8, 0.8], SpeedMin: 0.8, SpeedMax: 2.8, Drag: 0.4, GravityScale: 0.8, Bounce: 0.2, WindCoupling: 0.35, LifeMin: 2.8, LifeMax: 4.0, SizeStart: 0.14, SizeEnd: 0.11, ColA: HexToLinear4('#35d6ff', 1), ColB: HexToLinear4('#ffffff', 0.25), Transition: { Wave: 'corner', HoldBase: 0.5, HoldSpread: 1.6, BurstShare: 0.55, Fragment: true } } },
    { Id: 'cube-coins', Name: 'Cube to Coins', Group: 'Transitions', Blurb: 'Surface grid of spun gold coins bursts outward and bounces along the floor.', Config: { Kind: 5, Shape: 5, Blend: 'alpha', Capacity: 256, Rate: 0, BurstEvery: 5.5, BurstCount: 256, EmitShape: 4, Origin: [0, 1.1, 0], BoxHalf: [0.75, 0.75, 0.75], SpeedMin: 1.4, SpeedMax: 3.8, Drag: 0.2, GravityScale: 0.95, Bounce: 0.42, WindCoupling: 0.2, LifeMin: 3.4, LifeMax: 4.8, SizeStart: 0.18, SizeEnd: 0.18, ColA: HexToLinear4('#ffc83d', 1), ColB: HexToLinear4('#fff2aa', 0.5), Transition: { Wave: 'corner', HoldBase: 0.35, HoldSpread: 1.0, BurstShare: 0.8 } } },
    { Id: 'melt-away', Name: 'Melt Away', Group: 'Transitions', Blurb: 'Surface voxel blocks detach in organic patches and drift away on wind.', Config: { Kind: 5, Shape: 4, Blend: 'alpha', Capacity: 512, Rate: 0, BurstEvery: 7.2, BurstCount: 512, EmitShape: 4, Origin: [-2.4, 1.1, 0], BoxHalf: [0.75, 0.75, 0.75], SpeedMin: 0.25, SpeedMax: 1.0, Drag: 0.65, GravityScale: 0.18, Buoyancy: 0.15, WindCoupling: 1.6, LifeMin: 4.2, LifeMax: 6.0, SizeStart: 0.13, SizeEnd: 0.06, ColA: HexToLinear4('#ffb347', 1), ColB: HexToLinear4('#ff541f', 0), Transition: { Wave: 'melt', HoldBase: 0.2, HoldSpread: 2.2, BurstShare: 0.2 } } },
    { Id: 'dissolve-butterflies', Name: 'Dissolve to Butterflies', Group: 'Transitions', Blurb: 'Surface dissolves into animated flapping butterflies rising on thermal wind.', Config: { Kind: 5, Shape: 7, Blend: 'alpha', Capacity: 340, Rate: 0, BurstEvery: 8.5, BurstCount: 340, EmitShape: 4, Origin: [2.4, 1.0, 0.2], BoxHalf: [0.75, 0.75, 0.75], SpeedMin: 0.3, SpeedMax: 1.1, Drag: 0.8, GravityScale: 0, Buoyancy: 0.75, Flutter: 1.4, WindCoupling: 1.1, LifeMin: 4.8, LifeMax: 7.2, SizeStart: 0.18, SizeEnd: 0.16, ColA: HexToLinear4('#ff9a3c', 1), ColB: HexToLinear4('#3ec8ff', 0.2), Transition: { Wave: 'melt', HoldBase: 0.25, HoldSpread: 2.4, BurstShare: 0.25, After: 'butterfly' } } },
    { Id: 'glitch-dissolve', Name: 'Glitch Dissolve', Group: 'Transitions', Blurb: 'Digital glitch quantization step-dissolving blocks in cyan-magenta streaks.', Config: { Kind: 5, Shape: 4, Blend: 'alpha', Capacity: 480, Rate: 0, BurstEvery: 6.8, BurstCount: 480, EmitShape: 4, Origin: [0, 1.1, 2.4], BoxHalf: [0.72, 0.72, 0.72], SpeedMin: 0.4, SpeedMax: 1.6, Drag: 0.75, GravityScale: 0.05, Buoyancy: 0.3, WindCoupling: 1.2, LifeMin: 3.0, LifeMax: 4.5, SizeStart: 0.13, SizeEnd: 0.01, ColA: HexToLinear4('#00ffd0', 1), ColB: HexToLinear4('#ff2d6f', 0), Transition: { Wave: 'glitch', HoldBase: 0.2, HoldSpread: 2.0, BurstShare: 0.35 } } },

    // Analytic Dipole Field Lines & Luminous Silk Streams
    { Id: 'magnetic-lines', Name: 'Dipole Field Lines', Group: 'Fields', Blurb: 'Analytic magnetic dipole field loops r = L·sin²θ glowing along flux paths.', Config: { Kind: 7, Shape: 0, Blend: 'add', Capacity: 48, Rate: 0, Origin: [0, 1.5, 0], ColA: HexToLinear4('#ff6a3d', 1), ColB: HexToLinear4('#ffe0a6', 1), Fibre: { Shape: 'trail', PathShape: 'Dipole field line', PathSize: 3.0, Strands: 44, Segments: 52, TrailLength: 0.34, Amplitude: 0.08, LoopSeconds: 7, Intensity: 1.3 } } },
    { Id: 'luminous-blossom', Name: 'Luminous Blossom', Group: 'Silk & Streaks', Blurb: 'Translucent 5-petal sapphire-cyan-violet silk flower canopy with glowing stamen pollen and rim bokeh.', Config: { Kind: 7, Shape: 0, Blend: 'add', Capacity: 420, Rate: 0, Origin: [0, 1.8, 0], ColA: HexToLinear4('#22d8ff', 1), ColB: HexToLinear4('#8d58ff', 1), Fibre: { Shape: 'blossom', Strands: 84, Segments: 36, Length: 4.5, Spread: 3.1, Amplitude: 1.55, Frequency: 5, LoopSeconds: 11, Intensity: 0.9 } } },
    { Id: 'prism-silk-stream', Name: 'Prism Silk Stream', Group: 'Silk & Streaks', Blurb: 'Swept cyan-violet-magenta silk flow stream curling upward with split tips and stardust particles.', Config: { Kind: 7, Shape: 0, Blend: 'add', Capacity: 240, Rate: 0, Origin: [0, 1.4, 0], ColA: HexToLinear4('#14d6ff', 1), ColB: HexToLinear4('#ff7db8', 1), Fibre: { Shape: 'stream', Strands: 72, Segments: 44, Length: 6.4, Spread: 1.05, Amplitude: 2.35, Ripple: 1.1, PhaseSpread: 1.65, LoopSeconds: 10, Intensity: 1.1 } } },
    { Id: 'anemone-burst', Name: 'Anemone Starburst', Group: 'Silk & Streaks', Blurb: 'Upward botanical starburst of indigo-violet-magenta filaments tipped with radiant sparks.', Config: { Kind: 7, Shape: 0, Blend: 'add', Capacity: 540, Rate: 0, Origin: [0, 0.5, 0], ColA: HexToLinear4('#4d1fb8', 1), ColB: HexToLinear4('#f0a6ff', 1), Fibre: { Shape: 'burst', Strands: 88, Segments: 36, Length: 4.2, Spread: 1.25, Amplitude: 0.55, LoopSeconds: 12, Intensity: 0.95 } } },
    { Id: 'curl-streamlines', Name: 'Curl Flow Streamlines', Group: 'Silk & Streaks', Blurb: 'Divergence-free 3D curl-noise vortex streamlines with silver-cyan beads and soft optical bokeh.', Config: { Kind: 7, Shape: 0, Blend: 'add', Capacity: 320, Rate: 0, Origin: [0, 2.0, 0], ColA: HexToLinear4('#1d6396', 1), ColB: HexToLinear4('#e8fbff', 1), Fibre: { Shape: 'curl', Strands: 80, Segments: 40, Length: 5.2, Spread: 2.2, Amplitude: 1.6, Ripple: 1.15, Waves: 0.75, LoopSeconds: 13, Intensity: 1.0 } } },
    { Id: 'void-filaments', Name: 'Void Core Filaments', Group: 'Silk & Streaks', Blurb: 'Radial ice-cyan filaments streaming outward around a crisp dark central void sphere.', Config: { Kind: 7, Shape: 0, Blend: 'add', Capacity: 420, Rate: 0, Origin: [0, 2.0, 0], ColA: HexToLinear4('#22b8ff', 1), ColB: HexToLinear4('#d8f8ff', 1), Fibre: { Shape: 'void', Strands: 84, Segments: 36, Length: 3.8, Spread: 1.15, Amplitude: 0.65, SheetWidth: 2.4, LoopSeconds: 11, Intensity: 1.05 } } }
];

export const PresetById = Object.fromEntries(EmitterPresets.map((P) => [P.Id, P]));

export function ConstructEmitterFromPreset(PresetId, Overrides = {})
{
    const P = PresetById[PresetId] || EmitterPresets[0];
    return BaseEmitter({
        ...P.Config,
        PresetId: P.Id,
        Name: Overrides.Name || P.Name,
        Group: P.Group,
        ...Overrides
    });
}

//------------------------------------------------------------------------------------------------------------------------
//                                  ANALYTIC LIGHT FIBRES (EXACT PARAMETER CURVE EVALUATOR)
//------------------------------------------------------------------------------------------------------------------------

const FIBRE_CURVES = {
    Ring: (A) => [Math.cos(A), Math.sin(A)],
    'Figure eight': (A) => [Math.sin(A), 0.52 * Math.sin(2 * A)],
    Rose: (A) => { const R = Math.cos(5 * A); return [R * Math.cos(A), R * Math.sin(A)]; },
    Weave: (A) => [Math.sin(3 * A), 0.6 * Math.sin(2 * A + 0.5)],
    Loop: (A) => { const R = (0.5 + Math.cos(A)) / 1.5; return [R * Math.cos(A), R * Math.sin(A)]; },
    Stadium: (A) => { const C = Math.cos(A), S = Math.sin(A); return [Math.sign(C) * Math.sqrt(Math.abs(C)), 0.36 * Math.sign(S) * Math.sqrt(Math.abs(S))]; },
    'Dipole field line': (A) => { const Th = A * 0.5; const R = Math.sin(Th) ** 2; return [R * Math.sin(Th), R * Math.cos(Th)]; }
};

export function EvaluateFibreStrands(Emitter, Time)
{
    const F = Emitter.Fibre || BaseFibreParams();
    const Rng = MakeMulberry32(F.Seed || 11);
    const Strands = Math.min(96, Math.max(4, Math.round(F.Strands || 48)));
    const Segs = Math.min(56, Math.max(10, Math.round(F.Segments || 36)));
    const LoopSec = Math.max(1, F.LoopSeconds || 10);
    const Phase = (Time / LoopSec) % 1;
    const Out = [];

    const Dir = Emitter.Dir || [1, 0, 0];
    const DL = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1;
    const Fwd = [Dir[0] / DL, Dir[1] / DL, Dir[2] / DL];
    const RefUp = Math.abs(Fwd[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const Right = [RefUp[1] * Fwd[2] - RefUp[2] * Fwd[1], RefUp[2] * Fwd[0] - RefUp[0] * Fwd[2], RefUp[0] * Fwd[1] - RefUp[1] * Fwd[0]];
    const RL = Math.hypot(Right[0], Right[1], Right[2]) || 1;
    Right[0] /= RL; Right[1] /= RL; Right[2] /= RL;
    const Up = [Fwd[1] * Right[2] - Fwd[2] * Right[1], Fwd[2] * Right[0] - Fwd[0] * Right[2], Fwd[0] * Right[1] - Fwd[1] * Right[0]];

    const CurveFn = FIBRE_CURVES[F.PathShape] || FIBRE_CURVES.Ring;

    for (let S = 0; S < Strands; ++S)
    {
        const R1 = Rng(), R2 = Rng(), R3 = Rng(), R4 = Rng();
        const UOff = (S / Strands - 0.5);
        const Pts = [];
        const Col = Lerp4(Emitter.ColA, Emitter.ColB, S / Math.max(1, Strands - 1));
        const Pulse = 1 - (F.PulseDepth || 0.25) * 0.5 * (1 - Math.sin(Time * (F.PulseRate || 1) * Math.PI * 2 + S * 0.45));

        if (F.Shape === 'trail')
        {
            const HeadPhase = (Phase + (S / Strands) * (F.PhaseSpread || 1.2) / (Math.PI * 2) + R1) % 1;
            const TailSpan = Clamp(F.TrailLength || 0.28, 0.05, 0.85);
            const Az = (S / Strands) * Math.PI * 2;
            const CosAz = Math.cos(Az), SinAz = Math.sin(Az);
            for (let T = 0; T <= Segs; ++T)
            {
                const U = T / Segs;
                const Ang = ((HeadPhase - (1 - U) * TailSpan) % 1 + 1) % 1 * Math.PI * 2;
                const [Px, Py] = CurveFn(Ang);
                const Size = (F.PathSize || 3.2) * (F.Scale || 1);
                const Wob = Math.sin(Ang * (F.Frequency || 2) + R2 * 6.28) * (F.Amplitude || 0.15) * 0.35;
                let Wx, Wy, Wz;
                if (F.PathShape === 'Dipole field line')
                {
                    Wx = Emitter.Origin[0] + Px * Size * CosAz;
                    Wy = Emitter.Origin[1] + Py * Size + Wob;
                    Wz = Emitter.Origin[2] + Px * Size * SinAz;
                }
                else
                {
                    Wx = Emitter.Origin[0] + Px * Size;
                    Wy = Emitter.Origin[1] + Math.sin(Ang * 2 + S * 0.3) * (F.Amplitude || 0.25) + UOff * 0.35;
                    Wz = Emitter.Origin[2] + Py * Size;
                }
                Pts.push({ Pos: [Wx, Wy, Wz], TNorm: U, Alpha: Math.pow(U, 1.35) * Pulse * (F.Intensity || 1.1) });
            }
        }
        else if (F.Shape === 'ribbon')
        {
            const WOffset = UOff * (F.SheetWidth || 2.8);
            const Len = (F.Length || 4.2) * (F.Scale || 1);
            for (let T = 0; T <= Segs; ++T)
            {
                const U = T / Segs;
                const Along = (U - 0.5) * Len;
                const Rip = Math.sin(U * Math.PI * 2 * (F.Waves || 1.0) - Phase * Math.PI * 2 * 2 + UOff * (F.PhaseSpread || 1.2) * 3) * (F.Ripple || 1.0) * 0.45;
                const Wx = Emitter.Origin[0] + Fwd[0] * Along + Right[0] * WOffset + Up[0] * Rip;
                const Wy = Emitter.Origin[1] + Fwd[1] * Along + Right[1] * WOffset + Up[1] * Rip;
                const Wz = Emitter.Origin[2] + Fwd[2] * Along + Right[2] * WOffset + Up[2] * Rip;
                const EdgeFade = Math.sin(U * Math.PI);
                Pts.push({ Pos: [Wx, Wy, Wz], TNorm: U, Alpha: EdgeFade * Pulse * (F.Intensity || 1.2) });
            }
        }
        else if (F.Shape === 'blossom' || F.Shape === 'stream' || F.Shape === 'burst' || F.Shape === 'curl' || F.Shape === 'void')
        {
            const Petals = Clamp(Math.round(F.Frequency || 5), 3, 12);
            const Theta = F.Shape === 'blossom'
                ? (S / Strands) * Math.PI * 2 + 0.24 * Math.sin((S / Strands) * Math.PI * 2 * Petals)
                : S * 2.39996323 + R1 * 0.45;
            for (let T = 0; T <= Segs; ++T)
            {
                const U = T / Segs;
                let Lx = 0, Ly = 0, Lz = 0;
                if (F.Shape === 'blossom')
                {
                    const Freq = Math.max(0.3, F.Waves || 0.88);
                    const CurlAt = (Px, Py, Pz) =>
                    {
                        const Qx = Px * Freq, Qy = Py * Freq, Qz = Pz * Freq;
                        return [
                            Math.cos(Qy * 1.1) * 1.1 - Math.sin(Qy * 1.9 - Qz * 0.7) * 0.6 - (-Math.sin(Qz * 1.3) * 1.1 + Math.cos(Qz * 1.7 + Qx * 0.8) * 0.6),
                            (-Math.sin(Qz * 1.3) * 1.1 + Math.cos(Qz * 1.7 + Qx * 0.8) * 0.6) - (Math.cos(Qx * 1.2) * 1.1 + Math.sin(Qx * 1.8 - Qy * 0.6) * 0.6),
                            (Math.cos(Qx * 1.2) * 1.1 + Math.sin(Qx * 1.8 - Qy * 0.6) * 0.6) - (Math.cos(Qy * 1.1) * 1.1 - Math.sin(Qy * 1.9 - Qz * 0.7) * 0.6)
                        ];
                    };
                    const CurlAmt = Math.max(0, F.Ripple ?? 1.18);
                    if (R4 < 0.28)
                    {
                        const Fl = 0.04 + 0.34 * Math.pow(R2, 0.72);
                        const R = (F.Spread || 3.4) * Fl * Math.pow(U, 1.18);
                        const Az = S * 2.39996323 + R1 * 0.55;
                        const Bx = Math.cos(Az) * R, By = Math.sin(Az) * R, Bz = (F.Amplitude || 1.55) * (0.98 + 0.44 * R3) * (U + 0.14 * Math.sin(U * Math.PI));
                        const [Cx, Cy, Cz] = CurlAt(Bx * 0.75 + 1.2, By * 0.75 + 2.3, Bz * 0.75 + 0.7);
                        const W = 0.14 * CurlAmt * Math.pow(U, 1.4);
                        Lx = Bx + Cx * W; Ly = By + Cy * W; Lz = Bz + Cz * W;
                    }
                    else
                    {
                        const IsGhost = R4 < 0.44;
                        const Pw = Math.cos(Petals * Theta + 0.62 * U);
                        const Scallop = 0.055 * Math.sin(Petals * 3 * Theta) * U * U;
                        const R = (F.Spread || 3.4) * (IsGhost ? 1.18 : 1.0) * (0.68 + 0.28 * Pw + Scallop) * (0.86 + 0.20 * R2) * Math.pow(U, 0.76);
                        const Bx = Math.cos(Theta) * R, By = Math.sin(Theta) * R;
                        const Bz = (F.Amplitude || 1.55) * (IsGhost ? 0.62 : 1.0) * (Math.sin(U * 2.30) * 0.54 + 0.34 * Pw * U * U + 0.14 * (Math.floor(R3 * 3) - 1) * U - 0.18 * U * U * U);
                        const [C1x, C1y, C1z] = CurlAt(Bx * 0.58 + 0.5, By * 0.58 - 1.1, Bz * 0.58 + 0.8);
                        const [C2x, C2y, C2z] = CurlAt(Bx * 1.28 + 3.7, By * 1.28 - 1.9, Bz * 1.28 + 5.1);
                        const W = 0.28 * CurlAmt * Math.pow(U, 1.35);
                        Lx = Bx + (C1x * 0.68 + C2x * 0.32) * W * 0.72;
                        Ly = By + (C1y * 0.68 + C2y * 0.32) * W * 0.72;
                        Lz = Bz + (C1z * 0.68 + C2z * 0.32) * W * 0.58;
                    }
                }
                else if (F.Shape === 'stream')
                {
                    const Along = (U - 0.42) * (F.Length || 6.4);
                    const Sweep = (F.Amplitude || 2.35) * Math.pow(Math.max(0, U - 0.12) / 0.88, 2.25);
                    const Flare = Math.max(0, Math.min(1, (U - 0.45) / 0.55));
                    const Curl = (F.Ripple || 1.1) * Math.sin(U * 4.6 + UOff * 2.6) * Flare;
                    const W = (F.Spread || 1.05) * (0.24 + 1.21 * Math.pow(U, 1.25));
                    const Tw = (F.PhaseSpread || 1.65) * U * U;
                    Lx = Along + Curl * 0.42;
                    Ly = Math.cos(Tw) * UOff * W;
                    Lz = Sweep + Math.sin(Tw) * UOff * W * 0.82 + Curl;
                }
                else if (F.Shape === 'burst')
                {
                    const Cone = Clamp(F.Spread || 0.95, 0.2, 2.8);
                    const Elev = (0.04 + 0.96 * Math.pow(R2, 1.32)) * Cone;
                    const Len = (F.Length || 4.4) * (0.68 + 0.52 * R3);
                    const R = Math.sin(Elev) * Len * Math.pow(U, 0.92);
                    Lx = Math.cos(Theta) * R;
                    Ly = Math.sin(Theta) * R;
                    Lz = Math.cos(Elev) * Len * U;
                }
                else if (F.Shape === 'curl')
                {
                    const BandA = (Math.floor(R1 * 5) / 5) * Math.PI * 2 + (R2 - 0.5) * 0.65;
                    const Rad = (F.Spread || 2.2) * (0.25 + 0.75 * Math.sqrt(R3));
                    let Px = Math.cos(BandA) * Rad, Py = Math.sin(BandA) * Rad, Pz = (R4 - 0.5) * (F.Amplitude || 1.6);
                    const Step = ((F.Length || 5.2) / 6) * U;
                    for (let K = 0; K < 6; ++K)
                    {
                        const Freq = F.Waves || 0.75;
                        const Vx = Math.cos(Py * Freq) - Math.sin(Pz * Freq);
                        const Vy = -Math.sin(Pz * Freq) - Math.cos(Px * Freq);
                        const Vz = Math.cos(Px * Freq) - Math.cos(Py * Freq);
                        const L = Math.hypot(Vx, Vy, Vz) || 1;
                        Px += (Vx / L) * Step * 0.45; Py += (Vy / L) * Step * 0.45; Pz += (Vz / L) * Step * 0.45;
                    }
                    Lx = Px; Ly = Py; Lz = Pz;
                }
                else
                {
                    const Rv = Math.max(0.32, (F.SheetWidth || 2.4) * 0.36);
                    const Az = (S / Strands) * Math.PI * 2;
                    const Tilt = (R2 - 0.5) * Clamp(F.Spread || 1.15, 0.15, 1.8);
                    const R = Rv + U * (F.Length || 3.8);
                    const Sw = (F.Amplitude || 0.65) * Math.sin(U * 4.4 + Az * 2) * 0.45;
                    Lx = Math.cos(Az + Sw / Math.max(R, 0.25)) * Math.cos(Tilt) * R;
                    Ly = Math.sin(Az + Sw / Math.max(R, 0.25)) * Math.cos(Tilt) * R;
                    Lz = Math.sin(Tilt) * R + Sw * 0.28;
                }
                const Sc = F.Scale || 1;
                Pts.push({ Pos: [Emitter.Origin[0] + Lx * Sc, Emitter.Origin[1] + Lz * Sc, Emitter.Origin[2] + Ly * Sc], TNorm: U, Alpha: Math.sin(U * Math.PI) * Pulse * (F.Intensity || 1.1) });
            }
        }
        else
        {
            // Analytic Bezier light streak with traveling window pulse
            const Len = (F.Length || 4.8) * (F.Scale || 1);
            const Spr = (F.Spread || 1.0) * (F.Scale || 1);
            const Amp = (F.Amplitude || 1.2) * (F.Scale || 1);
            const Lat = (R1 - 0.5) * Spr * 2;
            const Vert = (R2 - 0.5) * Spr * 1.4;
            const WinCen = (Phase * 1.4 + R3) % 1;
            const WinHalf = Clamp((F.Window || 0.5) * 0.5, 0.1, 0.9);
            for (let T = 0; T <= Segs; ++T)
            {
                const U = T / Segs;
                const Along = U * Len;
                const SwayX = Math.sin(U * Math.PI * (F.Frequency || 1.2) + R4 * 6.28) * Amp * 0.45;
                const SwayY = Math.cos(U * Math.PI * (F.Frequency || 1.2) * 0.9 + R2 * 6.28) * Amp * 0.35;
                const Wx = Emitter.Origin[0] + Fwd[0] * Along + Right[0] * (Lat + SwayX) + Up[0] * (Vert + SwayY);
                const Wy = Emitter.Origin[1] + Fwd[1] * Along + Right[1] * (Lat + SwayX) + Up[1] * (Vert + SwayY);
                const Wz = Emitter.Origin[2] + Fwd[2] * Along + Right[2] * (Lat + SwayX) + Up[2] * (Vert + SwayY);
                const DistW = Math.min(Math.abs(U - WinCen), 1 - Math.abs(U - WinCen));
                const WinAlpha = Clamp(1 - DistW / WinHalf, 0.08, 1.0);
                Pts.push({ Pos: [Wx, Wy, Wz], TNorm: U, Alpha: WinAlpha * Pulse * (F.Intensity || 1.2) });
            }
        }
        Out.push({ Pts, Col, Width: (F.Thickness || 1.4) * 0.014 });
    }
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  MIDPOINT-DISPLACEMENT LIGHTNING STORM & LIGHTNING WEB
//------------------------------------------------------------------------------------------------------------------------

export class LightningStorm
{
    constructor()
    {
        this.Bolts = [];
        this.Flash = 0;
        this.Strikes = 0;
        this.LastStrikeAt = null;
        this.NextAutoTime = 2.0;
        this.Rng = MakeMulberry32(20261111);
    }

    BuildSegments(Start, End, Amp, Levels, Width, BranchChance)
    {
        const Segs = [];
        const Rec = (A, B, Disp, Lvl, W, BranchOk) => {
            if (Lvl <= 0 || Segs.length > 720) { Segs.push({ A, B, W }); return; }
            const M = [
                (A[0] + B[0]) * 0.5 + (this.Rng() - 0.5) * Disp,
                (A[1] + B[1]) * 0.5 + (this.Rng() - 0.5) * Disp * 0.4,
                (A[2] + B[2]) * 0.5 + (this.Rng() - 0.5) * Disp
            ];
            Rec(A, M, Disp * 0.52, Lvl - 1, W, BranchOk);
            Rec(M, B, Disp * 0.52, Lvl - 1, W, BranchOk);
            if (BranchOk && Lvl >= 3 && this.Rng() < BranchChance)
            {
                const E = [
                    M[0] + (this.Rng() - 0.5) * Disp * 1.9 + (B[0] - A[0]) * 0.3,
                    M[1] - Disp * (0.55 + this.Rng() * 0.7),
                    M[2] + (this.Rng() - 0.5) * Disp * 1.9 + (B[2] - A[2]) * 0.3
                ];
                Rec(M, E, Disp * 0.55, Lvl - 2, W * 0.52, false);
            }
        };
        Rec(Start, End, Amp, Levels, Width, true);
        return Segs;
    }

    StrikeGround(Now, StormCfg = {})
    {
        const X = (this.Rng() - 0.5) * 7.5;
        const Z = (this.Rng() - 0.5) * 7.5;
        const Top = [X + (this.Rng() - 0.5) * 1.8, 9.5, Z + (this.Rng() - 0.5) * 1.8];
        const Gnd = [X, 0.02, Z];
        const Segs = this.BuildSegments(Top, Gnd, StormCfg.Amp ?? 1.7, Math.min(6, StormCfg.Levels ?? 5), 0.085, StormCfg.BranchChance ?? 0.35);
        this.Bolts.push({ Segs, T0: Now, Life: 0.38, Seed: this.Rng() * 999 });
        this.Flash = Math.min(1.3, this.Flash + 1.0);
        this.Strikes++;
        this.LastStrikeAt = [...Gnd];
        return Gnd;
    }

    TriggerWeb(Now, Nodes, StormCfg = {})
    {
        if (Nodes.length < 2) return 0;
        const Pairs = new Set();
        let Created = 0;
        for (let I = 0; I < Nodes.length; ++I)
        {
            const A = Nodes[I];
            const Near = Nodes.map((B, J) => ({ J, D: Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) }))
                .filter((O) => O.J !== I && O.D > 0.25)
                .sort((X, Y) => X.D - Y.D)
                .slice(0, 2);
            for (const N of Near)
            {
                const Key = `${Math.min(I, N.J)}-${Math.max(I, N.J)}`;
                if (Pairs.has(Key)) continue;
                Pairs.add(Key);
                const B = Nodes[N.J];
                const Segs = this.BuildSegments(A, B, Math.min(1.4, 0.06 * N.D + 0.35), 4, 0.06, 0.4);
                this.Bolts.push({ Segs, T0: Now, Life: 0.34, Seed: this.Rng() * 999 });
                Created++;
            }
        }
        this.Flash = Math.min(1.2, this.Flash + 0.75);
        this.Strikes++;
        return Created;
    }

    Update(Dt, Now, StormCfg, ActiveNodes = [])
    {
        this.Flash = Math.max(0, this.Flash - Dt * 3.4);
        this.Bolts = this.Bolts.filter((B) => Now - B.T0 < B.Life);
        const Hits = [];
        if (StormCfg?.AutoStrike && Now >= this.NextAutoTime)
        {
            if (StormCfg.WebMode && ActiveNodes.length >= 2) this.TriggerWeb(Now, ActiveNodes, StormCfg);
            else Hits.push(this.StrikeGround(Now, StormCfg));
            const MinI = StormCfg.IntervalMin ?? 2.5;
            const MaxI = Math.max(MinI, StormCfg.IntervalMax ?? 7.0);
            this.NextAutoTime = Now + MinI + this.Rng() * (MaxI - MinI);
        }
        return Hits;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                  LIVE PARTICLE SIMULATION KERNEL (.Integration + LJ + Boids + Transitions)
//------------------------------------------------------------------------------------------------------------------------

export class ParticleSimulator
{
    constructor(Seed = 1337)
    {
        this.Rng = MakeMulberry32(Seed);
        this.States = new Map(); // Token -> { Particles: [], Accum: 0, NextBurstAt: 0, Stats: {...}, CellMap: Map }
        this.Lightning = new LightningStorm();
        this.TotalAlive = 0;
        this.TotalEnergy = 0;
        this.MolecularStats = { A: 0, B: 0, C: 0, Temp: 0 };
    }

    ResetAll()
    {
        this.States.clear();
        this.Lightning = new LightningStorm();
        this.TotalAlive = 0;
        this.TotalEnergy = 0;
    }

    EnsureSystemState(Emitter, Now = 0)
    {
        let S = this.States.get(Emitter.Token);
        if (!S)
        {
            S = {
                Particles: [],
                Accum: 0,
                NextBurstAt: Emitter.BurstEvery > 0 ? 0.05 : -1,
                TransitionPhaseAt: Now,
                Stats: { Alive: 0, KineticEnergy: 0, MeanSpeed: 0, A: 0, B: 0, C: 0 }
            };
            this.States.set(Emitter.Token, S);
            if (Emitter.Kind === ParticleKind.AtomsLJ || Emitter.Kind === ParticleKind.ChemicalsABC)
            {
                this.SeedMolecularEnsemble(Emitter, S);
            }
            else if (Emitter.BurstEvery > 0 && Emitter.EmitShape === 4)
            {
                this.SpawnBurst(Emitter, Emitter.BurstCount, Emitter.Origin, Now);
                S.NextBurstAt = Now + Emitter.BurstEvery;
            }
            else if (Emitter.Rate > 0)
            {
                // Pre-warm steady emitters slightly so viewport opens visually rich immediately
                const PreSpawn = Math.min(Math.round(Emitter.Rate * 0.35), Math.floor(Emitter.Capacity * 0.35));
                for (let I = 0; I < PreSpawn; ++I) this.SpawnSingle(Emitter, S, Emitter.Origin, Now, true);
            }
        }
        return S;
    }

    SeedMolecularEnsemble(Emitter, S)
    {
        const N = Clamp(Math.round(Emitter.Capacity), 24, 600);
        const Hx = Math.max(0.3, Emitter.BoxHalf?.[0] ?? 1.0);
        const Hy = Math.max(0.3, Emitter.BoxHalf?.[1] ?? 1.0);
        const Hz = Math.max(0.3, Emitter.BoxHalf?.[2] ?? 1.0);
        const VScale = Math.sqrt(Math.max(0.05, Emitter.Temperature ?? 0.65)) * 1.6;
        S.Particles.length = 0;
        for (let I = 0; I < N; ++I)
        {
            const Species = Emitter.Kind === ParticleKind.ChemicalsABC ? (this.Rng() < (Emitter.FracA ?? 0.5) ? 0 : 1) : 0;
            S.Particles.push({
                X: Emitter.Origin[0] + (this.Rng() * 2 - 1) * Hx * 0.92,
                Y: Emitter.Origin[1] + (this.Rng() * 2 - 1) * Hy * 0.92,
                Z: Emitter.Origin[2] + (this.Rng() * 2 - 1) * Hz * 0.92,
                Vx: (this.Rng() * 2 - 1) * VScale,
                Vy: (this.Rng() * 2 - 1) * VScale,
                Vz: (this.Rng() * 2 - 1) * VScale,
                Age: 0,
                Life: 999999,
                Size: Emitter.SizeStart,
                Spin: 0,
                SpinVel: 0,
                Seed: this.Rng(),
                Species,
                Hold: 0,
                Trail: []
            });
        }
    }

    RandomDirectionInCone(Dir, Spread)
    {
        const L = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1;
        const Ax = Dir[0] / L, Ay = Dir[1] / L, Az = Dir[2] / L;
        const Ref = Math.abs(Ay) < 0.95 ? [0, 1, 0] : [1, 0, 0];
        const Tx = Ref[1] * Az - Ref[2] * Ay, Ty = Ref[2] * Ax - Ref[0] * Az, Tz = Ref[0] * Ay - Ref[1] * Ax;
        const TL = Math.hypot(Tx, Ty, Tz) || 1;
        const Ux = Tx / TL, Uy = Ty / TL, Uz = Tz / TL;
        const Vx = Ay * Uz - Az * Uy, Vy = Az * Ux - Ax * Uz, Vz = Ax * Uy - Ay * Ux;

        const CosMax = Math.cos(Clamp(Spread, 0, Math.PI));
        const CosTheta = Mix(CosMax, 1, this.Rng());
        const SinTheta = Math.sqrt(Math.max(0, 1 - CosTheta * CosTheta));
        const Phi = this.Rng() * Math.PI * 2;
        const Cx = Math.cos(Phi) * SinTheta, Cy = Math.sin(Phi) * SinTheta;
        return [
            Ux * Cx + Vx * Cy + Ax * CosTheta,
            Uy * Cx + Vy * Cy + Ay * CosTheta,
            Uz * Cx + Vz * Cy + Az * CosTheta
        ];
    }

    SpawnSingle(Emitter, S, OriginOverride, Now, Prewarm = false, TransitionPos = null)
    {
        if (S.Particles.length >= Math.min(4096, Emitter.Capacity)) return;
        const BaseOrig = OriginOverride || Emitter.Origin;
        let Px = BaseOrig[0], Py = BaseOrig[1], Pz = BaseOrig[2];
        let Hold = 0;

        if (TransitionPos)
        {
            Px = TransitionPos[0]; Py = TransitionPos[1]; Pz = TransitionPos[2];
            const Tr = Emitter.Transition || BaseTransitionParams();
            if (Tr.Wave === 'melt')
            {
                const Patch = 0.5 + 0.5 * Math.sin(Px * 4.5 + Pz * 3.7) * Math.cos(Py * 4.1);
                Hold = Tr.HoldBase + Patch * Tr.HoldSpread;
            }
            else if (Tr.Wave === 'glitch')
            {
                const Block = Math.floor((Px + 4) * 3) * 0.37 + Math.floor((Py + 4) * 3) * 0.61;
                Hold = Tr.HoldBase + ((Block % 1 + 1) % 1) * Tr.HoldSpread;
            }
            else
            {
                const Hx = Math.max(0.2, Emitter.BoxHalf?.[0] ?? 0.8);
                const Corner = Clamp((Px - BaseOrig[0] + Hx) / (2 * Hx), 0, 1);
                Hold = Tr.HoldBase + Corner * Tr.HoldSpread;
            }
        }
        else if (Emitter.EmitShape === 1)
        {
            const U = this.Rng() * 2 - 1, A = this.Rng() * Math.PI * 2, R = Math.cbrt(this.Rng()) * (Emitter.Radius || 0.4);
            const Sxy = Math.sqrt(Math.max(0, 1 - U * U));
            Px += R * Sxy * Math.cos(A); Py += R * U; Pz += R * Sxy * Math.sin(A);
        }
        else if (Emitter.EmitShape === 2)
        {
            const R = Math.sqrt(this.Rng()) * (Emitter.Radius || 0.6), A = this.Rng() * Math.PI * 2;
            Px += Math.cos(A) * R; Pz += Math.sin(A) * R;
        }
        else if (Emitter.EmitShape === 3)
        {
            const Hx = Emitter.BoxHalf?.[0] ?? 1, Hy = Emitter.BoxHalf?.[1] ?? 1, Hz = Emitter.BoxHalf?.[2] ?? 1;
            Px += (this.Rng() * 2 - 1) * Hx; Py += (this.Rng() * 2 - 1) * Hy; Pz += (this.Rng() * 2 - 1) * Hz;
        }

        const Dir = TransitionPos
            ? this.RandomDirectionInCone([Px - BaseOrig[0], Py - BaseOrig[1] + 0.35, Pz - BaseOrig[2]], 0.85)
            : this.RandomDirectionInCone(Emitter.Dir, Emitter.Spread);
        const Spd = Mix(Emitter.SpeedMin, Emitter.SpeedMax, this.Rng());
        const Life = Mix(Emitter.LifeMin, Emitter.LifeMax, this.Rng());

        let Vx = Dir[0] * Spd, Vy = Dir[1] * Spd, Vz = Dir[2] * Spd;
        if (Emitter.Attractor && !TransitionPos)
        {
            // Accretion orbital tangent initial velocity
            const Rx = Px - BaseOrig[0], Rz = Pz - BaseOrig[2], R = Math.max(0.25, Math.hypot(Rx, Rz));
            const OrbSpd = Math.sqrt(Math.max(0.5, Emitter.Attractor.Strength) / R) * 1.45;
            Vx = (-Rz / R) * OrbSpd; Vz = (Rx / R) * OrbSpd; Vy = (this.Rng() - 0.5) * 0.2;
        }

        const Age = Prewarm ? this.Rng() * Life * 0.85 : 0;
        S.Particles.push({
            X: Px + (Prewarm ? Vx * Age * 0.25 : 0),
            Y: Math.max(0.02, Py + (Prewarm ? Vy * Age * 0.25 : 0)),
            Z: Pz + (Prewarm ? Vz * Age * 0.25 : 0),
            Vx, Vy, Vz,
            Age,
            Life,
            Size: Emitter.SizeStart * (Emitter.SizeScale || 1),
            Spin: this.Rng() * Math.PI * 2,
            SpinVel: (this.Rng() - 0.5) * 5.0,
            Seed: this.Rng(),
            Species: 0,
            Hold,
            Fragmented: false,
            Trail: Emitter.Trail?.Enabled ? [[Px, Py, Pz]] : null
        });
    }

    SpawnBurst(Emitter, Count, AtOrigin, Now)
    {
        const S = this.EnsureSystemState(Emitter, Now);
        if (Emitter.EmitShape === 4)
        {
            // Surface cube lattice for Transitions (Derez, Melt, Butterflies, Glitch)
            S.Particles.length = 0;
            const Hx = Emitter.BoxHalf?.[0] ?? 0.75;
            const Hy = Emitter.BoxHalf?.[1] ?? 0.75;
            const Hz = Emitter.BoxHalf?.[2] ?? 0.75;
            const Side = Clamp(Math.round(Math.cbrt(Count * 2)), 4, 9);
            const Orig = AtOrigin || Emitter.Origin;
            for (let Ix = 0; Ix < Side; ++Ix)
            {
                for (let Iy = 0; Iy < Side; ++Iy)
                {
                    for (let Iz = 0; Iz < Side; ++Iz)
                    {
                        if (Ix > 0 && Ix < Side - 1 && Iy > 0 && Iy < Side - 1 && Iz > 0 && Iz < Side - 1) continue;
                        const Pos = [
                            Orig[0] + ((Ix / (Side - 1)) * 2 - 1) * Hx,
                            Orig[1] + ((Iy / (Side - 1)) * 2 - 1) * Hy,
                            Orig[2] + ((Iz / (Side - 1)) * 2 - 1) * Hz
                        ];
                        this.SpawnSingle(Emitter, S, Orig, Now, false, Pos);
                    }
                }
            }
            return;
        }

        const Orig = Emitter.BurstAtOrigin
            ? (AtOrigin || Emitter.Origin)
            : [Emitter.Origin[0] + (this.Rng() - 0.5) * 6.5, Emitter.Origin[1] + (this.Rng() - 0.5) * 1.6, Emitter.Origin[2] + (this.Rng() - 0.5) * 6.5];
        for (let I = 0; I < Count; ++I) this.SpawnSingle(Emitter, S, Orig, Now, false);
    }

    StepMolecularSystem(Emitter, S, Dt)
    {
        const Pts = S.Particles;
        const N = Pts.length;
        if (!N) return;

        const Hx = Math.max(0.35, Emitter.BoxHalf?.[0] ?? 1.0);
        const Hy = Math.max(0.35, Emitter.BoxHalf?.[1] ?? 1.0);
        const Hz = Math.max(0.35, Emitter.BoxHalf?.[2] ?? 1.0);
        const Ox = Emitter.Origin[0], Oy = Emitter.Origin[1], Oz = Emitter.Origin[2];
        const Sigma = Clamp(Emitter.Sigma ?? 0.22, 0.08, 0.5);
        const Eps = Clamp(Emitter.Epsilon ?? 0.18, 0.02, 1.5);
        const Cut = Sigma * 2.5;
        const Cut2 = Cut * Cut;
        const CellSize = Math.max(0.18, Cut);

        const Grid = new Map();
        for (let I = 0; I < N; ++I)
        {
            const P = Pts[I];
            const K = `${Math.floor(P.X / CellSize)},${Math.floor(P.Y / CellSize)},${Math.floor(P.Z / CellSize)}`;
            let Bin = Grid.get(K);
            if (!Bin) { Bin = []; Grid.set(K, Bin); }
            Bin.push(I);
        }

        const Temp = Math.max(0.05, Emitter.Temperature ?? 0.65);
        const Damp = Clamp(Emitter.LangevinDamp ?? 1.6, 0.1, 10);
        const NoiseAmp = Math.sqrt(2 * Damp * Temp * 1.45 / Math.max(1e-4, Dt));
        const IsChem = Emitter.Kind === ParticleKind.ChemicalsABC;
        const ReactR2 = (Emitter.ReactRadius ?? 0.34) ** 2;
        const ReactProb = 1 - Math.exp(-(Emitter.ReactRate ?? 6.0) * Dt);
        const DissocProb = 1 - Math.exp(-(Emitter.Dissociation ?? 0.35) * Dt);

        let CountA = 0, CountB = 0, CountC = 0, KE = 0;

        for (let I = 0; I < N; ++I)
        {
            const P = Pts[I];
            const Cx = Math.floor(P.X / CellSize), Cy = Math.floor(P.Y / CellSize), Cz = Math.floor(P.Z / CellSize);
            let Fx = 0, Fy = 0, Fz = 0;

            for (let Dx = -1; Dx <= 1; ++Dx)
            {
                for (let Dy = -1; Dy <= 1; ++Dy)
                {
                    for (let Dz = -1; Dz <= 1; ++Dz)
                    {
                        const Bin = Grid.get(`${Cx + Dx},${Cy + Dy},${Cz + Dz}`);
                        if (!Bin) continue;
                        for (const J of Bin)
                        {
                            if (J <= I) continue;
                            const Q = Pts[J];
                            const Rx = P.X - Q.X, Ry = P.Y - Q.Y, Rz = P.Z - Q.Z;
                            const R2 = Rx * Rx + Ry * Ry + Rz * Rz;
                            if (R2 < 1e-6 || R2 > Cut2) continue;

                            // Pairwise reaction A + B -> C
                            if (IsChem && ((P.Species === 0 && Q.Species === 1) || (P.Species === 1 && Q.Species === 0)) && R2 < ReactR2 && this.Rng() < ReactProb)
                            {
                                P.Species = 2; Q.Species = 2;
                            }

                            const SafeR2 = Math.max(R2, (Sigma * 0.78) ** 2);
                            const Inv2 = (Sigma * Sigma) / SafeR2;
                            const Inv6 = Inv2 * Inv2 * Inv2;
                            const ForceMag = Clamp((24 * Eps / SafeR2) * (2 * Inv6 * Inv6 - Inv6), -28, 28);
                            const Dfx = ForceMag * Rx, Dfy = ForceMag * Ry, Dfz = ForceMag * Rz;
                            Fx += Dfx; Fy += Dfy; Fz += Dfz;
                            Q.Vx -= Dfx * Dt; Q.Vy -= Dfy * Dt; Q.Vz -= Dfz * Dt;
                        }
                    }
                }
            }

            if (IsChem && P.Species === 2 && this.Rng() < DissocProb)
            {
                P.Species = this.Rng() < (Emitter.FracA ?? 0.5) ? 0 : 1;
            }

            // Langevin stochastic thermostat keeps ensemble at target Temperature kT
            Fx += -Damp * P.Vx + (this.Rng() * 2 - 1) * NoiseAmp;
            Fy += -Damp * P.Vy + (this.Rng() * 2 - 1) * NoiseAmp;
            Fz += -Damp * P.Vz + (this.Rng() * 2 - 1) * NoiseAmp;

            P.Vx = Clamp(P.Vx + Fx * Dt, -9, 9);
            P.Vy = Clamp(P.Vy + Fy * Dt, -9, 9);
            P.Vz = Clamp(P.Vz + Fz * Dt, -9, 9);
            P.X += P.Vx * Dt; P.Y += P.Vy * Dt; P.Z += P.Vz * Dt;

            // Elastic confining wall boundaries inside BoxHalf
            if (P.X < Ox - Hx) { P.X = Ox - Hx; P.Vx = Math.abs(P.Vx); }
            else if (P.X > Ox + Hx) { P.X = Ox + Hx; P.Vx = -Math.abs(P.Vx); }
            if (P.Y < Oy - Hy) { P.Y = Oy - Hy; P.Vy = Math.abs(P.Vy); }
            else if (P.Y > Oy + Hy) { P.Y = Oy + Hy; P.Vy = -Math.abs(P.Vy); }
            if (P.Z < Oz - Hz) { P.Z = Oz - Hz; P.Vz = Math.abs(P.Vz); }
            else if (P.Z > Oz + Hz) { P.Z = Oz + Hz; P.Vz = -Math.abs(P.Vz); }

            const V2 = P.Vx * P.Vx + P.Vy * P.Vy + P.Vz * P.Vz;
            KE += 0.5 * V2;
            if (P.Species === 0) CountA++;
            else if (P.Species === 1) CountB++;
            else CountC++;
        }

        S.Stats = { Alive: N, KineticEnergy: KE, MeanSpeed: Math.sqrt((2 * KE) / Math.max(1, N)), A: CountA, B: CountB, C: CountC };
    }

    StepSwarmSystem(Emitter, S, Scene, Dt, Time)
    {
        const Pts = S.Particles;
        const N = Pts.length;
        const R = Math.max(0.6, Emitter.SwarmRadius || 2.0);
        const R2 = R * R;
        const Solo = Scene.Viz?.SoloToken || null;
        let KE = 0;

        for (let I = 0; I < N; ++I)
        {
            const P = Pts[I];
            P.Age += Dt;
            if (P.Age >= P.Life) continue;

            let CohX = 0, CohY = 0, CohZ = 0, AliX = 0, AliY = 0, AliZ = 0, SepX = 0, SepY = 0, SepZ = 0, Neigh = 0;
            for (let J = 0; J < N; ++J)
            {
                if (I === J) continue;
                const Q = Pts[J];
                const Dx = Q.X - P.X, Dy = Q.Y - P.Y, Dz = Q.Z - P.Z;
                const D2 = Dx * Dx + Dy * Dy + Dz * Dz;
                if (D2 > R2 || D2 < 1e-6) continue;
                Neigh++;
                CohX += Q.X; CohY += Q.Y; CohZ += Q.Z;
                AliX += Q.Vx; AliY += Q.Vy; AliZ += Q.Vz;
                if (D2 < (R * 0.35) ** 2)
                {
                    const Inv = 1 / Math.max(0.08, D2);
                    SepX -= Dx * Inv * 0.28; SepY -= Dy * Inv * 0.28; SepZ -= Dz * Inv * 0.28;
                }
            }

            let SteerX = (Emitter.Origin[0] - P.X) * 0.45 + Math.sin(Time * 2.1 + P.Seed * 19) * 0.65;
            let SteerY = (Emitter.Origin[1] - P.Y) * 0.55 + Math.cos(Time * 1.7 + P.Seed * 13) * 0.45;
            let SteerZ = (Emitter.Origin[2] - P.Z) * 0.45 + Math.cos(Time * 2.3 + P.Seed * 23) * 0.65;

            if (Neigh > 0)
            {
                SteerX += ((CohX / Neigh - P.X) * 0.8 + (AliX / Neigh - P.Vx) * 0.7 + SepX * 1.4);
                SteerY += ((CohY / Neigh - P.Y) * 0.8 + (AliY / Neigh - P.Vy) * 0.7 + SepY * 1.4);
                SteerZ += ((CohZ / Neigh - P.Z) * 0.8 + (AliZ / Neigh - P.Vz) * 0.7 + SepZ * 1.4);
            }

            const Buckets = ResolveFieldBuckets(Scene.Fields, [P.X, P.Y, P.Z], Time, { SoloToken: Solo });
            [P.Vx, P.Vy, P.Vz] = AdvanceVelocityByFields(
                [P.Vx + SteerX * Dt, P.Vy + SteerY * Dt, P.Vz + SteerZ * Dt],
                Buckets, Emitter.WindCoupling, Emitter.Drag, 0, Dt
            );
            const Spd = Math.hypot(P.Vx, P.Vy, P.Vz);
            if (Spd > 3.8) { const Scl = 3.8 / Spd; P.Vx *= Scl; P.Vy *= Scl; P.Vz *= Scl; }
            P.X += P.Vx * Dt; P.Y = Math.max(0.15, P.Y + P.Vy * Dt); P.Z += P.Vz * Dt;
            KE += 0.5 * (P.Vx * P.Vx + P.Vy * P.Vy + P.Vz * P.Vz);
        }
        S.Particles = Pts.filter((P) => P.Age < P.Life);
        S.Stats = { Alive: S.Particles.length, KineticEnergy: KE, MeanSpeed: Math.sqrt((2 * KE) / Math.max(1, S.Particles.length)), A: 0, B: 0, C: 0 };
    }

    Step(Scene, RawDt, Time)
    {
        const Dt = Clamp(RawDt, 0.0005, 0.035);
        const Solo = Scene.Viz?.SoloToken || null;
        const Integrator = Scene.Integration?.Integrator || 'VelocityVerlet';
        const FloorY = Scene.Integration?.FloorY ?? 0;

        // Gather active emitter locations for Lightning Web
        const ActiveNodes = [];
        for (const E of Scene.Emitters)
        {
            if (E.Enabled && (!Solo || E.Token === Solo)) ActiveNodes.push(E.Origin);
        }

        // Advance lightning bolts & fire strike bursts at ground impact
        const Hits = this.Lightning.Update(Dt, Time, Scene.Storm, ActiveNodes);
        if (Hits.length > 0)
        {
            for (const E of Scene.Emitters)
            {
                if (E.OnStrikeBurst && E.Enabled)
                {
                    for (const HitPos of Hits) this.SpawnBurst(E, E.BurstCount || 120, HitPos, Time);
                }
            }
        }

        let TotalAlive = 0, TotalEnergy = 0, MolA = 0, MolB = 0, MolC = 0, MolTempSum = 0, MolCount = 0;

        for (const Emitter of Scene.Emitters)
        {
            if (!Emitter.Enabled || (Solo && Emitter.Token !== Solo))
            {
                const St = this.States.get(Emitter.Token);
                if (St) St.Stats.Alive = 0;
                continue;
            }
            const S = this.EnsureSystemState(Emitter, Time);

            if (Emitter.Kind === ParticleKind.LightFibre)
            {
                S.Stats = { Alive: Emitter.Fibre?.Strands || 48, KineticEnergy: 0, MeanSpeed: 0, A: 0, B: 0, C: 0 };
                TotalAlive += S.Stats.Alive;
                continue;
            }

            if (Emitter.Kind === ParticleKind.AtomsLJ || Emitter.Kind === ParticleKind.ChemicalsABC)
            {
                this.StepMolecularSystem(Emitter, S, Dt);
                TotalAlive += S.Stats.Alive;
                TotalEnergy += S.Stats.KineticEnergy;
                MolA += S.Stats.A; MolB += S.Stats.B; MolC += S.Stats.C;
                MolTempSum += S.Stats.MeanSpeed; MolCount++;
                continue;
            }

            // Rate emission + periodic bursts
            if (Emitter.Rate > 0)
            {
                S.Accum += Emitter.Rate * Dt;
                const EmitCount = Math.min(80, Math.floor(S.Accum));
                S.Accum -= EmitCount;
                for (let I = 0; I < EmitCount; ++I) this.SpawnSingle(Emitter, S, null, Time, false);
            }
            if (Emitter.BurstEvery > 0 && Time >= S.NextBurstAt)
            {
                this.SpawnBurst(Emitter, Emitter.BurstCount, null, Time);
                S.NextBurstAt = Time + Emitter.BurstEvery;
            }

            if (Emitter.Kind === ParticleKind.SwarmBoids)
            {
                this.StepSwarmSystem(Emitter, S, Scene, Dt, Time);
                TotalAlive += S.Stats.Alive;
                TotalEnergy += S.Stats.KineticEnergy;
                continue;
            }

            // Standard / WindFlutter / VFX / Transition integration
            const Pts = S.Particles;
            const ChildFragments = [];
            let KE = 0;

            for (let I = 0; I < Pts.length; ++I)
            {
                const P = Pts[I];
                P.Age += Dt;
                if (P.Age >= P.Life) continue;
                if (P.Hold > 0 && P.Age < P.Hold) continue;

                const Buckets = ResolveFieldBuckets(Scene.Fields, [P.X, P.Y, P.Z], Time, { SoloToken: Solo });
                if (Emitter.GravityScale !== 1.0)
                {
                    Buckets.Acc[1] += (Emitter.GravityScale - 1.0) * (-9.81);
                    // Only scale Earth gravity component cleanly by matching user override on gravity fields
                    const HasGrav = Scene.Fields.some((F) => F.Enabled && F.Kind === 'gravity');
                    if (!HasGrav) Buckets.Acc[1] = -9.81 * Emitter.GravityScale;
                }

                // Emitter-local accretion attractor (Black Hole) or magnetic guiding
                if (Emitter.Attractor)
                {
                    const Dx = Emitter.Origin[0] - P.X, Dy = Emitter.Origin[1] - P.Y, Dz = Emitter.Origin[2] - P.Z;
                    const R = Math.max(0.25, Math.hypot(Dx, Dy, Dz));
                    if (R < Emitter.Attractor.Horizon) { P.Age = P.Life; continue; }
                    const Grav = Emitter.Attractor.Strength / (R * 0.75 + 0.35);
                    Buckets.Acc[0] += (Dx / R) * Grav; Buckets.Acc[1] += (Dy / R) * Grav; Buckets.Acc[2] += (Dz / R) * Grav;
                }
                if (Emitter.MagneticGuide)
                {
                    const Dx = P.X - Emitter.Origin[0], Dy = P.Y - Emitter.Origin[1], Dz = P.Z - Emitter.Origin[2];
                    const R = Math.max(0.35, Math.hypot(Dx, Dy, Dz));
                    const Bx = 3 * Dx * Dy / (R * R * R), By = 3 * Dy * Dy / (R * R * R) - 1 / R, Bz = 3 * Dz * Dy / (R * R * R);
                    const BL = Math.hypot(Bx, By, Bz) || 1;
                    Buckets.Acc[0] += (Bx / BL) * Emitter.MagneticGuide.Strength;
                    Buckets.Acc[1] += (By / BL) * Emitter.MagneticGuide.Strength;
                    Buckets.Acc[2] += (Bz / BL) * Emitter.MagneticGuide.Strength;
                }

                if (Emitter.Flutter > 0)
                {
                    Buckets.Acc[0] += Math.sin(Time * 4.2 + P.Seed * 21) * Emitter.Flutter * 2.2;
                    Buckets.Acc[2] += Math.cos(Time * 3.7 + P.Seed * 17) * Emitter.Flutter * 2.2;
                }

                if (Integrator === 'RK2Midpoint')
                {
                    const HalfV = AdvanceVelocityByFields([P.Vx, P.Vy, P.Vz], Buckets, Emitter.WindCoupling, Emitter.Drag, Emitter.Buoyancy, Dt * 0.5);
                    const MidPos = [P.X + HalfV[0] * Dt * 0.5, P.Y + HalfV[1] * Dt * 0.5, P.Z + HalfV[2] * Dt * 0.5];
                    const MidB = ResolveFieldBuckets(Scene.Fields, MidPos, Time + Dt * 0.5, { SoloToken: Solo });
                    [P.Vx, P.Vy, P.Vz] = AdvanceVelocityByFields([P.Vx, P.Vy, P.Vz], MidB, Emitter.WindCoupling, Emitter.Drag, Emitter.Buoyancy, Dt);
                    P.X += HalfV[0] * Dt; P.Y += HalfV[1] * Dt; P.Z += HalfV[2] * Dt;
                }
                else if (Integrator === 'VelocityVerlet')
                {
                    const OldVx = P.Vx, OldVy = P.Vy, OldVz = P.Vz;
                    [P.Vx, P.Vy, P.Vz] = AdvanceVelocityByFields([OldVx, OldVy, OldVz], Buckets, Emitter.WindCoupling, Emitter.Drag, Emitter.Buoyancy, Dt);
                    P.X += 0.5 * (OldVx + P.Vx) * Dt;
                    P.Y += 0.5 * (OldVy + P.Vy) * Dt;
                    P.Z += 0.5 * (OldVz + P.Vz) * Dt;
                }
                else
                {
                    // Semi-Implicit Euler
                    [P.Vx, P.Vy, P.Vz] = AdvanceVelocityByFields([P.Vx, P.Vy, P.Vz], Buckets, Emitter.WindCoupling, Emitter.Drag, Emitter.Buoyancy, Dt);
                    P.X += P.Vx * Dt; P.Y += P.Vy * Dt; P.Z += P.Vz * Dt;
                }

                P.Spin += P.SpinVel * Dt;

                // Floor impact + Bounce + Derez Fragmentation
                if (P.Y <= FloorY)
                {
                    P.Y = FloorY + 0.004;
                    if (Emitter.Transition?.Fragment && !P.Fragmented && S.Particles.length + ChildFragments.length < Emitter.Capacity)
                    {
                        P.Fragmented = true;
                        P.Age = P.Life;
                        for (let C = 0; C < 4; ++C)
                        {
                            ChildFragments.push({
                                X: P.X, Y: FloorY + 0.05, Z: P.Z,
                                Vx: (this.Rng() - 0.5) * 2.8, Vy: 1.2 + this.Rng() * 1.8, Vz: (this.Rng() - 0.5) * 2.8,
                                Age: 0, Life: 1.1, Size: P.Size * 0.48, Spin: 0, SpinVel: 4, Seed: this.Rng(), Species: 0, Hold: 0, Fragmented: true, Trail: null
                            });
                        }
                        continue;
                    }
                    if (Emitter.Bounce > 0 && P.Vy < -0.25)
                    {
                        P.Vy = -P.Vy * Emitter.Bounce;
                        P.Vx *= 0.84; P.Vz *= 0.84;
                    }
                    else
                    {
                        P.Vy = 0; P.Vx *= 0.72; P.Vz *= 0.72;
                    }
                }

                if (P.Trail && Emitter.Trail?.Enabled)
                {
                    const MaxSegs = Emitter.Trail.Segments || 10;
                    const Last = P.Trail[P.Trail.length - 1];
                    if (!Last || Math.hypot(P.X - Last[0], P.Y - Last[1], P.Z - Last[2]) > 0.045)
                    {
                        P.Trail.push([P.X, P.Y, P.Z]);
                        if (P.Trail.length > MaxSegs) P.Trail.shift();
                    }
                }
                KE += 0.5 * (P.Vx * P.Vx + P.Vy * P.Vy + P.Vz * P.Vz);
            }

            if (ChildFragments.length > 0) Pts.push(...ChildFragments);
            S.Particles = Pts.filter((P) => P.Age < P.Life);
            S.Stats = { Alive: S.Particles.length, KineticEnergy: KE, MeanSpeed: Math.sqrt((2 * KE) / Math.max(1, S.Particles.length)), A: 0, B: 0, C: 0 };
            TotalAlive += S.Particles.length;
            TotalEnergy += KE;
        }

        this.TotalAlive = TotalAlive;
        this.TotalEnergy = TotalEnergy;
        this.MolecularStats = { A: MolA, B: MolB, C: MolC, Temp: MolCount > 0 ? MolTempSum / MolCount : 0 };
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                  6 SCENARIO WORKSPACES + .ParticleSpace TOML + .Revision RECORDER
//------------------------------------------------------------------------------------------------------------------------

export function GetActiveSliceAxes(Viz)
{
    if (!Viz) return ['XZ'];
    if (Viz.SliceAxes)
    {
        const Out = ['XZ', 'XY', 'YZ'].filter((K) => Boolean(Viz.SliceAxes[K]));
        if (Out.length > 0) return Out;
    }
    return [Viz.SliceAxis || 'XZ'];
}

export function ConstructParticleSpace(Key = 'lab')
{
    const BaseViz = {
        Projection: '3d',
        SliceAxis: 'XZ',
        SliceAxes: { XZ: true, XY: false, YZ: false },
        SliceHeight: 1.2,
        Particles: true,
        Trails: true,
        FieldOverlay: false,
        FieldQuantity: 'Flow',
        Arrows: false,
        Bounds: true,
        Grid: true,
        FixedMax: 12,
        Opacity: 0.42,
        SoloToken: null
    };

    const BaseInteg = { Integrator: 'VelocityVerlet', FixedDt: 1 / 60, Substeps: 1, FloorY: 0 };
    const BaseStorm = { AutoStrike: false, WebMode: false, IntervalMin: 3.0, IntervalMax: 7.5, Amp: 1.8, Levels: 5, BranchChance: 0.35 };

    if (Key === 'storm')
    {
        return {
            Key: 'storm',
            Name: 'Storm & Lightning Web',
            Description: 'Branching fractal lightning strikes, tornado debris vortex, rainfall & pulsed fireflies.',
            Probe: [0, 1.8, 0],
            Viz: { ...BaseViz, FieldOverlay: true },
            Integration: { ...BaseInteg },
            Storm: { ...BaseStorm, AutoStrike: true, IntervalMin: 2.2, IntervalMax: 5.5 },
            Emitters: [
                ConstructEmitterFromPreset('strikeSparks'),
                ConstructEmitterFromPreset('rain'),
                ConstructEmitterFromPreset('tornadoDebris', { Origin: [-1.2, 0.1, -1.2] }),
                ConstructEmitterFromPreset('fireflies')
            ],
            Fields: [
                ConstructField('prevailing', { Name: 'Storm Jet', Strength: 5.5, Bearing: 75 }),
                ConstructField('tornado', { Name: 'Mesocyclone Vortex', Centre: [-1.2, 1.8, -1.2], Strength: 8.5, Radius: 4.5, Swirl: 1.4 }),
                ConstructField('gravity', { Name: 'Earth Gravity', Strength: 9.81 }),
                ConstructField('outflow', { Name: 'Gust Outflow', Centre: [2.2, 1.5, 2.0], Strength: 5.0, Radius: 4.2, RateHz: 0.4 })
            ],
            Revision: { Sequence: 0, BudgetBytes: DOC_REVISION_CAP_BYTES, History: [] }
        };
    }

    if (Key === 'fibres')
    {
        return {
            Key: 'fibres',
            Name: 'Magnetic Dipole & Fields',
            Description: 'Analytic dipole field lines & magnetic plasma particles.',
            Probe: [0, 1.6, 0],
            Viz: { ...BaseViz, Bounds: true },
            Integration: { ...BaseInteg },
            Storm: { ...BaseStorm },
            Emitters: [
                ConstructEmitterFromPreset('magnetic-lines'),
                ConstructEmitterFromPreset('magneticParticles')
            ],
            Fields: [
                ConstructField('magnetic', { Name: 'Central Magnetic Dipole', Centre: [0, 1.5, 0], Strength: 6.5, Radius: 6.0 }),
                ConstructField('orbit', { Name: 'Cyclotron Drive', Centre: [0, 1.5, 0], Strength: 4.0, Radius: 5.5, Swirl: 3.5 }),
                ConstructField('curl', { Name: 'Ambient Eddy Curl', Centre: [0, 2.0, 0], Strength: 2.2, Radius: 6.5 })
            ],
            Revision: { Sequence: 0, BudgetBytes: DOC_REVISION_CAP_BYTES, History: [] }
        };
    }

    if (Key === 'transitions')
    {
        return {
            Key: 'transitions',
            Name: 'VFX & Cube Transitions',
            Description: 'Derez fragmentation cubes, butterflied dissolves, coin fountains, buoyant flames & smoke plumes.',
            Probe: [0, 1.4, 0],
            Viz: { ...BaseViz },
            Integration: { ...BaseInteg },
            Storm: { ...BaseStorm },
            Emitters: [
                ConstructEmitterFromPreset('derez-cube', { Origin: [-1.8, 1.1, 0] }),
                ConstructEmitterFromPreset('dissolve-butterflies', { Origin: [2.2, 1.0, 0] }),
                ConstructEmitterFromPreset('fire', { Origin: [-3.6, 0.15, -2.8] }),
                ConstructEmitterFromPreset('smoke', { Origin: [-3.0, 0.25, -2.8] }),
                ConstructEmitterFromPreset('bubbles', { Origin: [0.4, 0.25, 2.6] })
            ],
            Fields: [
                ConstructField('prevailing', { Name: 'Studio Crosswind', Strength: 2.8, Bearing: 65 }),
                ConstructField('gravity', { Name: 'Earth Gravity', Strength: 9.81 }),
                ConstructField('lift', { Name: 'Thermal Updraft', Centre: [2.2, 1.5, 0], Strength: 5.5, Radius: 3.6 })
            ],
            Revision: { Sequence: 0, BudgetBytes: DOC_REVISION_CAP_BYTES, History: [] }
        };
    }

    if (Key === 'chemistry')
    {
        return {
            Key: 'chemistry',
            Name: 'Molecular LJ & Swarms',
            Description: 'Lennard-Jones 12-6 Argon chamber, reversible A+B⇌C kinetics, Boids insect swarm & viscous drag volume.',
            Probe: [2.4, 1.2, 0],
            Viz: { ...BaseViz, FieldOverlay: true },
            Integration: { ...BaseInteg, Integrator: 'VelocityVerlet' },
            Storm: { ...BaseStorm },
            Emitters: [
                ConstructEmitterFromPreset('atoms', { Origin: [2.5, 1.2, -2.2], Capacity: 340 }),
                ConstructEmitterFromPreset('chemicals', { Origin: [2.5, 1.2, 2.2], Capacity: 340 }),
                ConstructEmitterFromPreset('insects', { Origin: [-2.4, 1.9, 0.2] }),
                ConstructEmitterFromPreset('fireflies', { Origin: [-1.8, 1.4, -2.2] })
            ],
            Fields: [
                ConstructField('curl', { Name: 'Chamber Turbulence', Centre: [-2.2, 1.8, 0], Strength: 3.2, Radius: 4.5 }),
                ConstructField('drag', { Name: 'Viscous Baffle Zone', Centre: [0, 1.4, 0], Strength: 3.0, BoxHalf: [1.4, 1.4, 2.2] }),
                ConstructField('attract', { Name: 'Swarm Lure Core', Centre: [-2.4, 1.8, 0], Strength: 4.5, Radius: 4.0, Swirl: 1.8 })
            ],
            Revision: { Sequence: 0, BudgetBytes: DOC_REVISION_CAP_BYTES, History: [] }
        };
    }

    return {
        Key: 'lab',
        Name: 'Default Particle Lab',
        Description: 'Hot sparks + fluttering leaves + LJ gas + A+B⇌C chemistry under Flow, Accelerate & Damp fields.',
        Probe: [0, 1.5, 0],
        Viz: { ...BaseViz },
        Integration: { ...BaseInteg },
        Storm: { ...BaseStorm },
        Emitters: [
            ConstructEmitterFromPreset('sparks'),
            ConstructEmitterFromPreset('leaves'),
            ConstructEmitterFromPreset('atoms'),
            ConstructEmitterFromPreset('chemicals')
        ],
        Fields: [
            ConstructField('prevailing', { Name: 'Prevailing Wind', Strength: 3.4, Bearing: 70 }),
            ConstructField('gust', { Name: 'Passing Gust', Centre: [-2.5, 1.8, 0], Strength: 4.8, Radius: 4.2, RateHz: 0.35 }),
            ConstructField('gravity', { Name: 'Earth Gravity', Strength: 9.81 }),
            ConstructField('drag', { Name: 'Damping Cushion', Centre: [0, 0.8, 2.6], Strength: 2.4, BoxHalf: [1.5, 0.9, 1.5], Enabled: false })
        ],
        Revision: { Sequence: 0, BudgetBytes: DOC_REVISION_CAP_BYTES, History: [] }
    };
}

// OperationRecorder (.Revision): tracks parametric undo/redo frames within 215 MiB budget
export class OperationRecorder
{
    constructor(MaxOps = 48)
    {
        this.MaxOps = MaxOps;
        this.Stack = [];
        this.Cursor = -1;
        this.Sequence = 0;
        this.Bytes = 0;
    }

    SnapshotScene(Scene)
    {
        return JSON.stringify({
            Probe: Scene.Probe,
            Integration: Scene.Integration,
            Storm: Scene.Storm,
            Emitters: Scene.Emitters,
            Fields: Scene.Fields
        });
    }

    Record(Label, Scene)
    {
        const Json = this.SnapshotScene(Scene);
        if (this.Cursor >= 0 && this.Stack[this.Cursor]?.Json === Json) return;
        this.Stack.splice(this.Cursor + 1);
        this.Sequence++;
        this.Stack.push({ Seq: this.Sequence, Label, Json, Bytes: Json.length * 2, Time: Date.now() });
        while (this.Stack.length > this.MaxOps) this.Stack.shift();
        this.Cursor = this.Stack.length - 1;
        this.Bytes = this.Stack.reduce((Acc, R) => Acc + R.Bytes, 0);
        if (Scene.Revision) Scene.Revision.Sequence = this.Sequence;
    }

    CanUndo() { return this.Cursor > 0; }
    CanRedo() { return this.Cursor < this.Stack.length - 1; }

    ApplyAt(Scene, Idx)
    {
        const Entry = this.Stack[Idx];
        if (!Entry) return null;
        const Data = JSON.parse(Entry.Json);
        Scene.Probe = Data.Probe;
        Scene.Integration = Data.Integration;
        Scene.Storm = Data.Storm;
        Scene.Emitters = Data.Emitters;
        Scene.Fields = Data.Fields;
        this.Cursor = Idx;
        return Entry;
    }

    Undo(Scene) { return this.CanUndo() ? this.ApplyAt(Scene, this.Cursor - 1) : null; }
    Redo(Scene) { return this.CanRedo() ? this.ApplyAt(Scene, this.Cursor + 1) : null; }
}

export function EncodeParticleSpaceToml(Scene, Sim = null, Recorder = null)
{
    const Lines = [
        '# Frontier Native .ParticleSpace Container Manifest',
        '[ParticleSpace]',
        `ScenarioName = "${Scene.Name}"`,
        `EmitterCount = ${Scene.Emitters.length}`,
        `FieldCount = ${Scene.Fields.length}`,
        `ProbeMetres = [${Scene.Probe.map((V) => Number(V).toFixed(2)).join(', ')}]`,
        '',
        '[Integration]',
        `Integrator = "${Scene.Integration?.Integrator || 'VelocityVerlet'}"`,
        `FixedDeltaTime = ${(Scene.Integration?.FixedDt ?? 1 / 60).toFixed(5)}`,
        `FloorYMetres = ${(Scene.Integration?.FloorY ?? 0).toFixed(2)}`,
        `StormAutoStrike = ${Boolean(Scene.Storm?.AutoStrike)}`,
        `StormWebMode = ${Boolean(Scene.Storm?.WebMode)}`
    ];

    for (const E of Scene.Emitters)
    {
        Lines.push(
            '',
            '[[SpawnSource]]',
            `Token = "${E.Token}"`,
            `Name = "${E.Name}"`,
            `Group = "${E.Group}"`,
            `Kind = ${E.Kind}`,
            `Shape = ${E.Shape}`,
            `Blend = "${E.Blend}"`,
            `Enabled = ${E.Enabled}`,
            `Capacity = ${E.Capacity}`,
            `RatePerSecond = ${E.Rate}`,
            `OriginMetres = [${E.Origin.map((V) => Number(V).toFixed(2)).join(', ')}]`,
            `SpeedRange = [${E.SpeedMin.toFixed(2)}, ${E.SpeedMax.toFixed(2)}]`,
            `WindCoupling = ${E.WindCoupling.toFixed(3)}`,
            `GravityScale = ${E.GravityScale.toFixed(3)}`
        );
        if (E.Trail?.Enabled)
        {
            Lines.push(
                '  [SpawnSource.Trail]',
                `  Segments = ${E.Trail.Segments}`,
                `  WidthMetres = ${E.Trail.Width.toFixed(4)}`
            );
        }
        if (E.Fibre)
        {
            Lines.push(
                '  [SpawnSource.Fibre]',
                `  Shape = "${E.Fibre.Shape}"`,
                `  PathShape = "${E.Fibre.PathShape}"`,
                `  Strands = ${E.Fibre.Strands}`,
                `  LoopSeconds = ${E.Fibre.LoopSeconds}`
            );
        }
    }

    for (const F of Scene.Fields)
    {
        Lines.push(
            '',
            '[[Field]]',
            `Token = "${F.Token}"`,
            `Name = "${F.Name}"`,
            `Kind = "${F.Kind}"`,
            `Contribution = "${FieldKindById[F.Kind]?.Give || 'Flow'}"`,
            `Reach = "${F.Reach}"`,
            `Enabled = ${F.Enabled}`,
            `CentreMetres = [${F.Centre.map((V) => Number(V).toFixed(2)).join(', ')}]`,
            `Strength = ${Number(F.Strength).toFixed(3)}`,
            `RadiusMetres = ${Number(F.Radius).toFixed(2)}`
        );
    }

    Lines.push(
        '',
        '[Revision]',
        `Sequence = ${Recorder?.Sequence ?? Scene.Revision?.Sequence ?? 0}`,
        `HistoryDepth = ${Recorder?.Stack?.length ?? 0}`,
        `DocumentBudgetBytes = ${DOC_REVISION_CAP_BYTES}`,
        `ActiveBytes = ${Recorder?.Bytes ?? 0}`,
        `TotalParticlesAlive = ${Sim?.TotalAlive ?? 0}`
    );

    return Lines;
}
