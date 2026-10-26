//============================================================================================================================================
//                                                              RELIEFFIELD.JS
//============================================================================================================================================
// 🧩 The terrain substrate: a 1024² Float32 relief field plus a registry of named, reusable channels
//    (flow, water, erosion wear, deposition, hardness, snow, moisture and authored paint channels).
//
// 📝 Channels are first-class fields, not shader tricks: erosion sequences write them, layer masks read
//    them, the material splat reads them, and every one of them can be painted by hand. Noise lives here
//    too — one seeded permutation lattice shared by every generator so a seed reproduces a whole world.

export const Resolution   = 1024;              // texels per side — the 1K working field
export const WorldExtent  = 2048.0;            // [m] the field spans 2 km × 2 km
export const TexelSize    = WorldExtent / Resolution;

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  SEEDED RANDOM
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 A small integer hash stream (PCG-style). One stream per seed so layers can draw independent sequences.

export function ConstructRandomStream(Seed)
{
    let StreamState = (Seed >>> 0) ^ 0x9E3779B9;
    if (StreamState === 0)
        StreamState = 0x85EBCA6B;
    return function NextRandom()
    {
        StreamState = (Math.imul(StreamState, 1664525) + 1013904223) >>> 0;
        let Mixed = StreamState;
        Mixed ^= Mixed >>> 15;
        Mixed = Math.imul(Mixed, 2246822519) >>> 0;
        Mixed ^= Mixed >>> 13;
        return (Mixed >>> 0) / 4294967296.0;
    };
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  GRADIENT LATTICE NOISE
//--------------------------------------------------------------------------------------------------------------------------------------------

const GradientX = new Float32Array(256);
const GradientY = new Float32Array(256);
for (let Index = 0; Index < 256; Index++)
{
    const Angle = (Index / 256.0) * Math.PI * 2.0;
    GradientX[Index] = Math.cos(Angle);
    GradientY[Index] = Math.sin(Angle);
}

export class LatticeNoise
{
    constructor(Seed)
    {
        const NextRandom = ConstructRandomStream(Seed);
        this.Permutation = new Uint8Array(512);
        const Order = new Uint8Array(256);
        for (let Index = 0; Index < 256; Index++)
            Order[Index] = Index;
        for (let Index = 255; Index > 0; Index--)
        {
            const SwapWith   = Math.floor(NextRandom() * (Index + 1));
            const Temporary  = Order[Index];
            Order[Index]     = Order[SwapWith];
            Order[SwapWith]  = Temporary;
        }
        for (let Index = 0; Index < 512; Index++)
            this.Permutation[Index] = Order[Index & 255];
    }

    // 📝 Classic 2D gradient noise, roughly in [-1, 1].
    Sample(PosX, PosY)
    {
        const Permutation = this.Permutation;
        const CellX    = Math.floor(PosX);
        const CellY    = Math.floor(PosY);
        const FracX    = PosX - CellX;
        const FracY    = PosY - CellY;
        const LatticeX = CellX & 255;
        const LatticeY = CellY & 255;
        const FadeX    = FracX * FracX * FracX * (FracX * (FracX * 6.0 - 15.0) + 10.0);
        const FadeY    = FracY * FracY * FracY * (FracY * (FracY * 6.0 - 15.0) + 10.0);

        const HashAA = Permutation[Permutation[LatticeX]     + LatticeY];
        const HashBA = Permutation[Permutation[LatticeX + 1] + LatticeY];
        const HashAB = Permutation[Permutation[LatticeX]     + LatticeY + 1];
        const HashBB = Permutation[Permutation[LatticeX + 1] + LatticeY + 1];

        const DotAA = GradientX[HashAA] * FracX         + GradientY[HashAA] * FracY;
        const DotBA = GradientX[HashBA] * (FracX - 1.0) + GradientY[HashBA] * FracY;
        const DotAB = GradientX[HashAB] * FracX         + GradientY[HashAB] * (FracY - 1.0);
        const DotBB = GradientX[HashBB] * (FracX - 1.0) + GradientY[HashBB] * (FracY - 1.0);

        const Lower = DotAA + FadeX * (DotBA - DotAA);
        const Upper = DotAB + FadeX * (DotBB - DotAB);
        return (Lower + FadeY * (Upper - Lower)) * 1.4142;
    }

    // 📝 Fractal Brownian motion normalised toward [-1, 1].
    Fractal(PosX, PosY, Octaves, Lacunarity, Gain)
    {
        let Amplitude  = 1.0;
        let FrequencyX = PosX;
        let FrequencyY = PosY;
        let Sum        = 0.0;
        let Normaliser = 0.0;
        for (let Octave = 0; Octave < Octaves; Octave++)
        {
            Sum        += Amplitude * this.Sample(FrequencyX, FrequencyY);
            Normaliser += Amplitude;
            const RotatedX = FrequencyX * 0.8 - FrequencyY * 0.6;
            const RotatedY = FrequencyX * 0.6 + FrequencyY * 0.8;
            FrequencyX = RotatedX * Lacunarity + 13.7;
            FrequencyY = RotatedY * Lacunarity + 7.3;
            Amplitude *= Gain;
        }
        return Sum / Normaliser;
    }

    // 📝 Ridged multifractal with un-pinned zero crossings, concave U-valley shaping, and Musgrave
    //    heterogeneous weighting. A single 2D gradient-noise octave vanishes at every integer lattice
    //    corner, which pins 1-|n| crests onto a fishnet of closed V-pits (\/). Combining two shifted
    //    incommensurate samples frees the zero-crossings into open mountain spines; squaring the
    //    base signal gives d/dx -> 0 in the troughs so valleys open into U-basins (\___/) rather
    //    than V-notches; weighting fine octaves by the coarse ridge keeps valley floors uncluttered.
    Ridged(PosX, PosY, Octaves, Lacunarity, Gain, Sharpness)
    {
        let Amplitude  = 0.5;
        let FrequencyX = PosX;
        let FrequencyY = PosY;
        let Sum        = 0.0;
        let Normaliser = 0.0;
        const Exp = Math.min(Math.max(Sharpness * 0.72, 0.75), 1.18);
        for (let Octave = 0; Octave < Octaves; Octave++)
        {
            const Primary   = this.Sample(FrequencyX, FrequencyY);
            const Secondary = this.Sample(FrequencyX * 1.37 + 17.3, FrequencyY * 1.37 - 9.1);
            const Signal    = Primary * 0.68 + Secondary * 0.32;
            let Ridge = 1.0 - Math.sqrt(Signal * Signal + 0.016);
            Ridge = Math.pow(Math.max(Ridge, 0.0), Exp);
            Sum        += Amplitude * Ridge;
            Normaliser += Amplitude;
            const RotatedX = FrequencyX * 0.8 - FrequencyY * 0.6;
            const RotatedY = FrequencyX * 0.6 + FrequencyY * 0.8;
            FrequencyX = RotatedX * Lacunarity + 5.1;
            FrequencyY = RotatedY * Lacunarity + 9.4;
            Amplitude *= Gain;
        }
        return Sum / Normaliser;   // in [0, 1)
    }

    // 📝 Worley cellular distances. Returns F2 - F1, which plateaus inside cells and creases at borders —
    //    the mesa/graben structure of deserts.
    Cellular(PosX, PosY)
    {
        const Permutation = this.Permutation;
        const CellX = Math.floor(PosX);
        const CellY = Math.floor(PosY);
        let Nearest  = 8.0;
        let Second   = 8.0;
        for (let OffsetY = -1; OffsetY <= 1; OffsetY++)
        {
            for (let OffsetX = -1; OffsetX <= 1; OffsetX++)
            {
                const NeighbourX = CellX + OffsetX;
                const NeighbourY = CellY + OffsetY;
                const Hash = Permutation[Permutation[NeighbourX & 255] + (NeighbourY & 255)];
                const PointX = NeighbourX + GradientX[Hash] * 0.44 + 0.5;
                const PointY = NeighbourY + GradientY[Hash] * 0.44 + 0.5;
                const DeltaX = PosX - PointX;
                const DeltaY = PosY - PointY;
                const Distance = Math.sqrt(DeltaX * DeltaX + DeltaY * DeltaY);
                if (Distance < Nearest)
                {
                    Second  = Nearest;
                    Nearest = Distance;
                }
                else if (Distance < Second)
                {
                    Second = Distance;
                }
            }
        }
        return Second - Nearest;
    }

    // 📝 Same Worley field, but also returns the winning cell's stable hash in [0, 1). Builders use it
    //    to give every plateau remnant its own level — without it all mesa tops saturate identically.
    CellularWithIdentity(PosX, PosY)
    {
        const Permutation = this.Permutation;
        const CellX = Math.floor(PosX);
        const CellY = Math.floor(PosY);
        let Nearest = 8.0;
        let Second  = 8.0;
        let Winner  = 0;
        for (let OffsetY = -1; OffsetY <= 1; OffsetY++)
        {
            for (let OffsetX = -1; OffsetX <= 1; OffsetX++)
            {
                const NeighbourX = CellX + OffsetX;
                const NeighbourY = CellY + OffsetY;
                const Hash = Permutation[Permutation[NeighbourX & 255] + (NeighbourY & 255)];
                const PointX = NeighbourX + GradientX[Hash] * 0.44 + 0.5;
                const PointY = NeighbourY + GradientY[Hash] * 0.44 + 0.5;
                const DeltaX = PosX - PointX;
                const DeltaY = PosY - PointY;
                const Distance = Math.sqrt(DeltaX * DeltaX + DeltaY * DeltaY);
                if (Distance < Nearest)
                {
                    Second  = Nearest;
                    Nearest = Distance;
                    Winner  = Hash;
                }
                else if (Distance < Second)
                {
                    Second = Distance;
                }
            }
        }
        return [Second - Nearest, Winner / 256.0];
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  CHANNEL REGISTRY
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Every channel is a full-resolution Float32 field with display metadata. Derived channels are owned
//    by the sequences that write them; authored channels come from the brush. Both are mask inputs.

export const DerivedChannels =
[
    { Name: "Flow",       Label: "Flow accumulation", Tint: [0.25, 0.55, 1.00], Writer: "Fluvial incision" },
    { Name: "Water",      Label: "Standing water",    Tint: [0.10, 0.45, 0.95], Writer: "Fluvial incision" },
    { Name: "Wear",       Label: "Erosion wear",      Tint: [1.00, 0.45, 0.20], Writer: "Hydraulic erosion" },
    { Name: "Deposition", Label: "Deposition",        Tint: [0.95, 0.80, 0.35], Writer: "Hydraulic / wind" },
    { Name: "Hardness",   Label: "Rock hardness",     Tint: [0.65, 0.60, 0.95], Writer: "Strata terrace" },
    { Name: "Snow",       Label: "Snow & ice",        Tint: [0.90, 0.95, 1.00], Writer: "Snow accumulation" },
    { Name: "Moisture",   Label: "Soil moisture",     Tint: [0.30, 0.85, 0.45], Writer: "Derived at rebuild" },
    { Name: "Occlusion",  Label: "Occlusion (baked)", Tint: [0.85, 0.85, 0.90], Writer: "Surface bake" },
    { Name: "Protrusion", Label: "Protrusion (baked)",Tint: [1.00, 0.85, 0.55], Writer: "Surface bake" },
    { Name: "CaveCutout", Label: "Cave openings (SDF)", Tint: [0.95, 0.38, 0.25], Writer: "Cave system (SDF)" },
];

export const MaterialPaintChannels = [];

export class ReliefField
{
    constructor()
    {
        this.Heights     = new Float32Array(Resolution * Resolution);
        this.BaseDelta   = new Float32Array(Resolution * Resolution);
        this.SculptDelta = new Float32Array(Resolution * Resolution);
        this.LayerCaves  = [];
        this.UserCaves   = [];
        this.Channels    = new Map();
        this.Minimum     = 0.0;
        this.Maximum     = 1.0;
        for (const Definition of DerivedChannels)
            this.RegisterChannel(Definition.Name, Definition.Label, Definition.Tint, false, Definition.Writer);
        const MaskChannel = this.RegisterChannel("Mask", "Combine mask (B&W)", [0.96, 0.96, 0.96], true, "B&W mask brush");
        MaskChannel.Samples.fill(1.0);
    }

    RegisterChannel(Name, Label, Tint, Authored, Writer)
    {
        let Channel = this.Channels.get(Name);
        if (!Channel)
        {
            Channel =
            {
                Name     : Name,
                Label    : Label,
                Tint     : Tint,
                Authored : Authored,
                Writer   : Writer,
                Samples  : new Float32Array(Resolution * Resolution),
            };
            this.Channels.set(Name, Channel);
        }
        return Channel;
    }

    Channel(Name)
    {
        return this.Channels.get(Name) || null;
    }

    ChannelSamples(Name)
    {
        const Channel = this.Channels.get(Name);
        return Channel ? Channel.Samples : null;
    }

    ClearDerivedChannels()
    {
        for (const Channel of this.Channels.values())
        {
            if (!Channel.Authored)
                Channel.Samples.fill(0.0);
        }
    }

    MeasureRange()
    {
        let Minimum = Infinity;
        let Maximum = -Infinity;
        const Heights = this.Heights;
        for (let Index = 0; Index < Heights.length; Index++)
        {
            const Height = Heights[Index];
            if (Height < Minimum) Minimum = Height;
            if (Height > Maximum) Maximum = Height;
        }
        this.Minimum = Minimum;
        this.Maximum = Maximum;
        return { Minimum, Maximum };
    }

    // 📝 Soil moisture is a rebuild-time derivation: low ground near drainage stays wet, crests dry out.
    DeriveMoisture()
    {
        const Flow     = this.ChannelSamples("Flow");
        const Water    = this.ChannelSamples("Water");
        const Moisture = this.ChannelSamples("Moisture");
        const Heights  = this.Heights;
        const Range    = Math.max(this.Maximum - this.Minimum, 1.0);
        for (let Index = 0; Index < Heights.length; Index++)
        {
            const Elevation = (Heights[Index] - this.Minimum) / Range;
            let Wet = Flow[Index] * 0.85 + Water[Index] * 1.2 + (1.0 - Elevation) * 0.22;
            Moisture[Index] = Wet < 0.0 ? 0.0 : Wet > 1.0 ? 1.0 : Wet;
        }
    }

    //--------------------------------------------------------------------------------------------------------------------------------------------
    //                                                              SAMPLING
    //--------------------------------------------------------------------------------------------------------------------------------------------

    SampleBilinear(Samples, WorldX, WorldZ)
    {
        const GridX = (WorldX / WorldExtent + 0.5) * Resolution - 0.5;
        const GridZ = (WorldZ / WorldExtent + 0.5) * Resolution - 0.5;
        const CellX = Math.floor(GridX);
        const CellZ = Math.floor(GridZ);
        const FracX = GridX - CellX;
        const FracZ = GridZ - CellZ;
        const ClampCoord = (Coord) => Coord < 0 ? 0 : Coord > Resolution - 1 ? Resolution - 1 : Coord;
        const X0 = ClampCoord(CellX);
        const X1 = ClampCoord(CellX + 1);
        const Z0 = ClampCoord(CellZ);
        const Z1 = ClampCoord(CellZ + 1);
        const AA = Samples[Z0 * Resolution + X0];
        const BA = Samples[Z0 * Resolution + X1];
        const AB = Samples[Z1 * Resolution + X0];
        const BB = Samples[Z1 * Resolution + X1];
        const Lower = AA + (BA - AA) * FracX;
        const Upper = AB + (BB - AB) * FracX;
        return Lower + (Upper - Lower) * FracZ;
    }

    HeightAt(WorldX, WorldZ)
    {
        return this.SampleBilinear(this.Heights, WorldX, WorldZ);
    }

    // 📝 Marches a ray against the relief and refines by bisection. Returns null on a miss.
    IntersectRay(OriginX, OriginY, OriginZ, DirX, DirY, DirZ)
    {
        const Reach = WorldExtent * 3.2;
        let PreviousT = 0.0;
        let PreviousClearance = OriginY - this.HeightAt(OriginX, OriginZ);
        if (PreviousClearance < 0.0)
            PreviousClearance = 0.0;
        const StepCount = 220;
        for (let StepIndex = 1; StepIndex <= StepCount; StepIndex++)
        {
            const T  = (StepIndex / StepCount) * Reach;
            const Px = OriginX + DirX * T;
            const Py = OriginY + DirY * T;
            const Pz = OriginZ + DirZ * T;
            if (Px < -WorldExtent * 0.5 || Px > WorldExtent * 0.5 || Pz < -WorldExtent * 0.5 || Pz > WorldExtent * 0.5)
            {
                PreviousT = T;
                continue;
            }
            const Clearance = Py - this.HeightAt(Px, Pz);
            if (Clearance <= 0.0)
            {
                let Lo = PreviousT;
                let Hi = T;
                for (let Refine = 0; Refine < 20; Refine++)
                {
                    const Mid = (Lo + Hi) * 0.5;
                    const Mx = OriginX + DirX * Mid;
                    const My = OriginY + DirY * Mid;
                    const Mz = OriginZ + DirZ * Mid;
                    if (My - this.HeightAt(Mx, Mz) > 0.0)
                        Lo = Mid;
                    else
                        Hi = Mid;
                }
                const HitT = (Lo + Hi) * 0.5;
                return {
                    X : OriginX + DirX * HitT,
                    Y : OriginY + DirY * HitT,
                    Z : OriginZ + DirZ * HitT,
                    T : HitT,
                };
            }
            PreviousT = T;
        }
        return null;
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  MASK WEIGHT
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 One mask response shared by every layer: a channel (or height, or slope) remapped through a
//    [low, high] window. This is the hinge the whole reusable-channel design swings on.

export function MaskWeight(Sample, Low, High, Invert)
{
    let Weight;
    if (High <= Low)
        Weight = Sample >= Low ? 1.0 : 0.0;
    else
    {
        Weight = (Sample - Low) / (High - Low);
        Weight = Weight < 0.0 ? 0.0 : Weight > 1.0 ? 1.0 : Weight;
        Weight = Weight * Weight * (3.0 - 2.0 * Weight);
    }
    return Invert ? 1.0 - Weight : Weight;
}

// 📝 Slope in rise-per-metre at one texel, from central differences.
export function SlopeAt(Heights, X, Z)
{
    const X0 = X > 0 ? X - 1 : X;
    const X1 = X < Resolution - 1 ? X + 1 : X;
    const Z0 = Z > 0 ? Z - 1 : Z;
    const Z1 = Z < Resolution - 1 ? Z + 1 : Z;
    const GradX = (Heights[Z * Resolution + X1] - Heights[Z * Resolution + X0]) / ((X1 - X0) * TexelSize);
    const GradZ = (Heights[Z1 * Resolution + X] - Heights[Z0 * Resolution + X]) / ((Z1 - Z0) * TexelSize);
    return Math.sqrt(GradX * GradX + GradZ * GradZ);
}
