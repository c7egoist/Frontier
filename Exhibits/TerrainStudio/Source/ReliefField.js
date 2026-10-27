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
        let Weight     = 1.0;
        const BaseExp  = Math.min(Math.max(Sharpness * 0.96, 0.95), 1.68);
        const EffGain  = Math.min(Gain, 0.44);
        for (let Octave = 0; Octave < Octaves; Octave++)
        {
            const Primary   = this.Sample(FrequencyX, FrequencyY);
            const Secondary = this.Sample(FrequencyX * 1.37 + 17.3, FrequencyY * 1.37 - 9.1);
            const Signal    = Primary * 0.70 + Secondary * 0.30;
            // Tight crest on macro octaves (0.00045) so main peaks are sharp pointed arêtes (/\),
            // slightly softer on micro octaves so flanks stay planar-concave instead of spiky.
            const CrestEps  = Octave < 2 ? 0.00045 : 0.0025;
            let Ridge = 1.0 - Math.sqrt(Signal * Signal + CrestEps);
            Ridge = Math.pow(Math.max(Ridge, 0.0), BaseExp);
            const Hetero = Ridge * (0.45 + 0.55 * Weight);
            Weight = Math.min(Math.max(Ridge * 1.45, 0.22), 1.0);
            Sum        += Amplitude * Hetero;
            Normaliser += Amplitude;
            const RotatedX = FrequencyX * 0.8 - FrequencyY * 0.6;
            const RotatedY = FrequencyX * 0.6 + FrequencyY * 0.8;
            FrequencyX = RotatedX * Lacunarity + 5.1;
            FrequencyY = RotatedY * Lacunarity + 9.4;
            Amplitude *= EffGain;
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
//                                                      SIMPLEX 2D & GRADIENT 3D NOISE (SLATE PORT)
//--------------------------------------------------------------------------------------------------------------------------------------------

const SimplexGrad2 =
[
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];
const SkewF2   = 0.5 * (Math.sqrt(3.0) - 1.0);
const UnskewG2 = (3.0 - Math.sqrt(3.0)) / 6.0;

export function Mulberry32(Seed)
{
    let Cursor = Seed >>> 0;
    return function NextRandom()
    {
        Cursor = (Cursor + 0x6D2B79F5) >>> 0;
        let Temp = Cursor;
        Temp = Math.imul(Temp ^ (Temp >>> 15), Temp | 1);
        Temp ^= Temp + Math.imul(Temp ^ (Temp >>> 7), Temp | 61);
        return ((Temp ^ (Temp >>> 14)) >>> 0) / 4294967296.0;
    };
}

export function HashCoords(CoordX, CoordY, Seed = 0)
{
    let Hash = (CoordX * 374761393 + CoordY * 668265263 + Seed * 2246822519) | 0;
    Hash = Math.imul(Hash ^ (Hash >>> 13), 1274126177);
    Hash ^= Hash >>> 16;
    return (Hash >>> 0) / 4294967296.0;
}

export class SimplexNoise
{
    constructor(Seed = 1)
    {
        const NextRandom = Mulberry32(Seed);
        const Order = new Uint8Array(256);
        for (let Index = 0; Index < 256; Index++)
            Order[Index] = Index;
        for (let Index = 255; Index > 0; Index--)
        {
            const Swap = Math.floor(NextRandom() * (Index + 1));
            const Temp = Order[Index];
            Order[Index] = Order[Swap];
            Order[Swap] = Temp;
        }
        this.Perm = new Uint8Array(512);
        this.PermMod12 = new Uint8Array(512);
        for (let Index = 0; Index < 512; Index++)
        {
            this.Perm[Index] = Order[Index & 255];
            this.PermMod12[Index] = this.Perm[Index] % 12;
        }
    }

    Sample(PosX, PosY)
    {
        const Perm = this.Perm;
        const PermMod12 = this.PermMod12;
        const Skew = (PosX + PosY) * SkewF2;
        const CellI = Math.floor(PosX + Skew);
        const CellJ = Math.floor(PosY + Skew);
        const Unskew = (CellI + CellJ) * UnskewG2;
        const X0 = PosX - (CellI - Unskew);
        const Y0 = PosY - (CellJ - Unskew);
        const StepI1 = X0 > Y0 ? 1 : 0;
        const StepJ1 = X0 > Y0 ? 0 : 1;
        const X1 = X0 - StepI1 + UnskewG2;
        const Y1 = Y0 - StepJ1 + UnskewG2;
        const X2 = X0 - 1.0 + 2.0 * UnskewG2;
        const Y2 = Y0 - 1.0 + 2.0 * UnskewG2;
        const II = CellI & 255;
        const JJ = CellJ & 255;
        let N0 = 0.0, N1 = 0.0, N2 = 0.0;
        let T0 = 0.5 - X0 * X0 - Y0 * Y0;
        if (T0 > 0.0)
        {
            const Grad = SimplexGrad2[PermMod12[II + Perm[JJ]]];
            T0 *= T0;
            N0 = T0 * T0 * (Grad[0] * X0 + Grad[1] * Y0);
        }
        let T1 = 0.5 - X1 * X1 - Y1 * Y1;
        if (T1 > 0.0)
        {
            const Grad = SimplexGrad2[PermMod12[II + StepI1 + Perm[JJ + StepJ1]]];
            T1 *= T1;
            N1 = T1 * T1 * (Grad[0] * X1 + Grad[1] * Y1);
        }
        let T2 = 0.5 - X2 * X2 - Y2 * Y2;
        if (T2 > 0.0)
        {
            const Grad = SimplexGrad2[PermMod12[II + 1 + Perm[JJ + 1]]];
            T2 *= T2;
            N2 = T2 * T2 * (Grad[0] * X2 + Grad[1] * Y2);
        }
        return 70.0 * (N0 + N1 + N2);
    }

    Fbm(PosX, PosY, Octaves = 6, Lacunarity = 2.0, Gain = 0.5)
    {
        let Sum = 0.0, Amp = 1.0, Norm = 0.0, Fx = PosX, Fy = PosY;
        for (let Octave = 0; Octave < Octaves; Octave++)
        {
            Sum  += Amp * this.Sample(Fx, Fy);
            Norm += Amp;
            Amp  *= Gain;
            Fx    = Fx * Lacunarity + 17.3;
            Fy    = Fy * Lacunarity - 9.1;
        }
        return Sum / Norm;
    }

    Ridged(PosX, PosY, Octaves = 8, Lacunarity = 2.05, Gain = 0.5, Sharpness = 2.0)
    {
        let Sum = 0.0, Amp = 0.5, Weight = 1.0, Norm = 0.0, Fx = PosX, Fy = PosY;
        for (let Octave = 0; Octave < Octaves; Octave++)
        {
            let Ridge = 1.0 - Math.abs(this.Sample(Fx, Fy));
            Ridge  = Math.pow(Math.max(Ridge, 0.0), Sharpness) * Weight;
            Weight = Math.min(1.0, Math.max(0.0, Ridge * 2.0));
            Sum   += Ridge * Amp;
            Norm  += Amp;
            Amp   *= Gain;
            Fx     = Fx * Lacunarity + 31.7;
            Fy     = Fy * Lacunarity + 5.9;
        }
        return Sum / Norm;
    }

    Billow(PosX, PosY, Octaves = 5, Lacunarity = 2.0, Gain = 0.5)
    {
        let Sum = 0.0, Amp = 1.0, Norm = 0.0, Fx = PosX, Fy = PosY;
        for (let Octave = 0; Octave < Octaves; Octave++)
        {
            Sum  += Amp * (Math.abs(this.Sample(Fx, Fy)) * 2.0 - 1.0);
            Norm += Amp;
            Amp  *= Gain;
            Fx   *= Lacunarity;
            Fy   *= Lacunarity;
        }
        return Sum / Norm;
    }
}

export class GradientNoise3
{
    constructor(Seed = 1)
    {
        const NextRandom = Mulberry32(Seed * 977 + 3);
        const Order = new Uint8Array(256);
        for (let Index = 0; Index < 256; Index++)
            Order[Index] = Index;
        for (let Index = 255; Index > 0; Index--)
        {
            const Swap = Math.floor(NextRandom() * (Index + 1));
            const Temp = Order[Index];
            Order[Index] = Order[Swap];
            Order[Swap] = Temp;
        }
        this.Perm = new Uint8Array(512);
        for (let Index = 0; Index < 512; Index++)
            this.Perm[Index] = Order[Index & 255];
    }

    Grad(Hash, Dx, Dy, Dz)
    {
        const H = Hash & 15;
        const U = H < 8 ? Dx : Dy;
        const V = H < 4 ? Dy : (H === 12 || H === 14 ? Dx : Dz);
        return ((H & 1) === 0 ? U : -U) + ((H & 2) === 0 ? V : -V);
    }

    Sample(PosX, PosY, PosZ)
    {
        const Perm = this.Perm;
        const CellX = Math.floor(PosX) & 255;
        const CellY = Math.floor(PosY) & 255;
        const CellZ = Math.floor(PosZ) & 255;
        const FracX = PosX - Math.floor(PosX);
        const FracY = PosY - Math.floor(PosY);
        const FracZ = PosZ - Math.floor(PosZ);
        const Fade = (T) => T * T * T * (T * (T * 6.0 - 15.0) + 10.0);
        const U = Fade(FracX), V = Fade(FracY), W = Fade(FracZ);
        const A  = Perm[CellX] + CellY, AA = Perm[A] + CellZ, AB = Perm[A + 1] + CellZ;
        const B  = Perm[CellX + 1] + CellY, BA = Perm[B] + CellZ, BB = Perm[B + 1] + CellZ;
        const Mix = (Lo, Hi, T) => Lo + T * (Hi - Lo);
        return Mix(
            Mix(Mix(this.Grad(Perm[AA], FracX, FracY, FracZ), this.Grad(Perm[BA], FracX - 1.0, FracY, FracZ), U),
                Mix(this.Grad(Perm[AB], FracX, FracY - 1.0, FracZ), this.Grad(Perm[BB], FracX - 1.0, FracY - 1.0, FracZ), U), V),
            Mix(Mix(this.Grad(Perm[AA + 1], FracX, FracY, FracZ - 1.0), this.Grad(Perm[BA + 1], FracX - 1.0, FracY, FracZ - 1.0), U),
                Mix(this.Grad(Perm[AB + 1], FracX, FracY - 1.0, FracZ - 1.0), this.Grad(Perm[BB + 1], FracX - 1.0, FracY - 1.0, FracZ - 1.0), U), V),
            W
        );
    }

    Fbm(PosX, PosY, PosZ, Octaves = 4, Lacunarity = 2.0, Gain = 0.5)
    {
        let Sum = 0.0, Amp = 1.0, Norm = 0.0;
        let Fx = PosX, Fy = PosY, Fz = PosZ;
        for (let Octave = 0; Octave < Octaves; Octave++)
        {
            Sum  += Amp * this.Sample(Fx, Fy, Fz);
            Norm += Amp;
            Amp  *= Gain;
            Fx    = Fx * Lacunarity + 11.7;
            Fy    = Fy * Lacunarity + 5.3;
            Fz    = Fz * Lacunarity - 7.9;
        }
        return Sum / Norm;
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
