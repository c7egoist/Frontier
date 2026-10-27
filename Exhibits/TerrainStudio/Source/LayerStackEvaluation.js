//============================================================================================================================================
//                                                              LAYERSTACKEVALUATION.JS
//============================================================================================================================================
// 🧩 The non-destructive layer stack: formation layers raise the land, erosion layers spend it, surface
//    layers dress it. Every layer carries its own seed, strength, blend operation and channel mask.
//
// 📝 Evaluation is cached per layer, so editing the snowline never re-runs the rivers. Masking and
//    strength are applied uniformly — each layer computes its result, then the stack mixes previous →
//    result through strength × mask weight. A layer can therefore be masked by the water it will one
//    day stand beside: paint the Water channel, point a layer's mask at it, rebuild.

import { Resolution, TexelSize, WorldExtent, LatticeNoise, SimplexNoise, HashCoords, MaskWeight, SlopeAt } from "./ReliefField.js?v=10";
import { HydraulicErosion, ThermalErosion, FluvialIncision, GlacialPolish, AeolianSettle, SnowAccumulation, ApplyRuggedOutcropsAndRocks, ApplyStrataPackages, RuggedPushPull, AddBoulderTors, BoxBlurInPlace } from "./ErosionSequence.js?v=10";
import { BuildProceduralCaves } from "./DistanceStamps.js?v=10";

async function YieldBriefly()
{
    await new Promise((Resolve) => setTimeout(Resolve, 0));
}

const Param = (Key, Label, Min, Max, Step, Default, Unit) =>
    ({ Key, Label, Control: "Slider", Min, Max, Step, Default, Unit: Unit || "" });

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  FORMATION FIELDS
//--------------------------------------------------------------------------------------------------------------------------------------------

async function BuildContinentalMass(Field, Layer, Out, Report, Cancel)
{
    const P      = Layer.Params;
    const Noise  = new LatticeNoise(Layer.Seed);
    const N      = Resolution;
    const Scale  = TexelSize / P.Wavelength;          // texel → noise space
    const WarpScale = TexelSize / (P.Wavelength * 2.3);
    const WarpTexels = P.Warp / TexelSize;
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const WarpX = Noise.Fractal(X * WarpScale + 31.7, Z * WarpScale + 11.3, 3, 2.0, 0.5) * WarpTexels;
            const WarpZ = Noise.Fractal(X * WarpScale + 7.9,  Z * WarpScale + 47.1, 3, 2.0, 0.5) * WarpTexels;
            const Raw = Noise.Fractal((X + WarpX) * Scale, (Z + WarpZ) * Scale, Math.round(P.Octaves), 2.02, P.Gain);
            let Unit = Raw * 0.5 + 0.5;
            // Plateau shaping: at strength 1 the curve's derivative dies at the top — flat uplands.
            const PlateauCurve = 1.0 - Math.pow(1.0 - Unit, 3.0);
            Unit = Unit + (PlateauCurve - Unit) * P.Plateau;
            Out[Z * N + X] = Unit;
            if (Unit < Lo) Lo = Unit;
            if (Unit > Hi) Hi = Unit;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    // A 2 km frame holds only a few base-octave features, so stretch the realised range onto the
    // promised amplitude — the seed chooses the shape, the slider chooses the size.
    const Span = Math.max(Hi - Lo, 0.0001);
    const TiltRadians = P.TiltAngle * Math.PI / 180.0;
    const TiltX = Math.cos(TiltRadians);
    const TiltZ = Math.sin(TiltRadians);
    for (let Index = 0; Index < Out.length; Index++)
    {
        const Tx = Index % N;
        const Tz = (Index / N) | 0;
        const Along = (Tx / N - 0.5) * TiltX + (Tz / N - 0.5) * TiltZ;
        Out[Index] = P.BaseElevation + ((Out[Index] - Lo) / Span) * P.Amplitude + P.Tilt * Along;
    }
}

async function BuildRidgeUplift(Field, Layer, Out, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x51AB);
    const N     = Resolution;
    const Scale = TexelSize / Math.max(P.Wavelength, 740.0);
    const WarpScale = TexelSize / (Math.max(P.Wavelength, 740.0) * 1.80);
    const WarpTexels = P.Warp / TexelSize;
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const WarpX = Noise.Fractal(X * WarpScale + 3.1, Z * WarpScale + 17.7, 3, 2.0, 0.5) * WarpTexels;
            const WarpZ = Noise.Fractal(X * WarpScale + 23.9, Z * WarpScale + 5.5, 3, 2.0, 0.5) * WarpTexels;
            const Ux = (X + WarpX) * Scale;
            const Uz = (Z + WarpZ) * Scale;

            // Monumental connected structural fold spines (4 octaves with sharp 0.00045 crest so
            // main peaks form pointed horns & arêtes while flanks sweep into wide glacial valleys).
            const StrikeA = Ux * 0.85 + Uz * 0.52;
            const CrossA  = -Ux * 0.52 + Uz * 0.85;
            const SpineA  = Noise.Ridged(StrikeA * 0.50, CrossA * 0.88, 4, 2.05, 0.42, P.Sharpness * 1.25);

            const StrikeB = Ux * 0.48 - Uz * 0.88;
            const CrossB  = Ux * 0.88 + Uz * 0.48;
            const SpineB  = Noise.Ridged(StrikeB * 0.55 + 7.4, CrossB * 0.90 - 4.1, 4, 2.05, 0.42, P.Sharpness * 1.22);

            const Diff = SpineA - SpineB;
            const MaxSpine = 0.5 * (SpineA + SpineB + Math.sqrt(Diff * Diff + 0.0003));
            // Pyramidal horn intersections: where two arêtes cross (SpineA * SpineB), the crest rises to a sharp Matterhorn point!
            const HornPeak = Math.pow(Math.max(SpineA * SpineB, 0.0), 0.72);
            const ConnectedSpine = 0.54 * MaxSpine + 0.46 * HornPeak;

            // Swiss-style fold-advected lateral spur ribs branching off the main mountain flanks.
            const SpurCoordX = Ux * 1.75 + (SpineA - 0.5) * 0.68;
            const SpurCoordZ = Uz * 1.75 - (SpineB - 0.5) * 0.68;
            const LateralSpurs = Noise.Ridged(SpurCoordX + 11.3, SpurCoordZ - 6.7, 4, 2.08, 0.42, P.Sharpness * 1.32);
            const SpurWeight = ConnectedSpine * (1.05 - ConnectedSpine * 0.22);

            // Chiseled pyramidal facetting on the upper horns so summits terminate in crisp angular points.
            const HornFacet = Noise.Ridged(Ux * 2.65 + 29.4, Uz * 2.65 - 18.2, 3, 2.05, 0.40, P.Sharpness * 1.45);
            const HornWeight = ConnectedSpine * ConnectedSpine;

            const Envelope = 0.45 + 0.55 * (Noise.Ridged(X * Scale * 0.38 + 9.2, Z * Scale * 0.38 + 4.4, 2, 2.0, 0.40, 1.15));

            const Raised = (0.66 * ConnectedSpine + 0.24 * LateralSpurs * SpurWeight + 0.10 * HornFacet * HornWeight) * Envelope;
            Out[Z * N + X] = Raised;
            if (Raised < Lo) Lo = Raised;
            if (Raised > Hi) Hi = Raised;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    const Span = Math.max(Hi - Lo, 0.0001);
    for (let Index = 0; Index < Out.length; Index++)
    {
        const Unit = Math.min(Math.max((Out[Index] - Lo) / Span, 0.0), 1.0);
        // Concave mountain flanks (\___/) rising to sharp pointed pyramidal horns & arête crests (/\).
        Out[Index] = Math.pow(Unit, 1.45) * P.Amplitude;
    }
}

async function BuildTectonicFront(Field, Layer, Out, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x77C3);
    const N     = Resolution;
    const Radians = P.Angle * Math.PI / 180.0;
    const CosA = Math.cos(Radians);
    const SinA = Math.sin(Radians);
    const AlongScale = 1.0 / P.Waviness;
    const CrestScale = TexelSize / Math.max(P.CrestWavelength, 480.0);
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const WorldX = (X + 0.5) * TexelSize - WorldExtent * 0.5;
            const WorldZ = (Z + 0.5) * TexelSize - WorldExtent * 0.5;
            const Along  = WorldX * CosA - WorldZ * SinA;
            const Across = WorldX * SinA + WorldZ * CosA;
            const Meander = Noise.Fractal(Along * AlongScale + 13.0, 4.7, 3, 2.0, 0.5) * P.Meander;
            const Distance = Across - P.Offset - Meander;
            const Width = Distance > 0.0 ? P.Width : P.Width * (1.0 - P.Asymmetry * 0.55);
            const NormDist = Math.abs(Distance) / Math.max(Width, 1.0);
            // Sharp concave-flanked ridge profile (exponent 1.04 instead of 1.65) so the tectonic divide rises to a pointed crest (/\), never a flat Gaussian dome!
            const Profile  = Math.exp(-Math.pow(NormDist, 1.04) * 1.12);
            const DivideA  = Noise.Ridged(Along * CrestScale * 0.52 + 2.2, Distance * CrestScale * 0.26, 4, 2.05, 0.42, 1.42);
            const DivideB  = Noise.Ridged(Along * CrestScale * 0.82 - 5.1, Distance * CrestScale * 0.42 + 3.7, 4, 2.05, 0.42, 1.38);
            const MainDivide = 0.22 + 0.46 * DivideA + 0.32 * Math.pow(DivideA * DivideB, 0.75);
            const Buttresses = Noise.Ridged(Along * CrestScale * 0.68 - 7.4, Distance * CrestScale * 0.32 + 4.1, 4, 2.05, 0.42, 1.35);
            const SpurFade   = Math.exp(-Math.pow(NormDist, 1.25) * 0.65);
            const Raised     = Profile * MainDivide + SpurFade * (1.0 - Profile * 0.35) * Buttresses * 0.58;
            Out[Z * N + X] = Raised;
            if (Raised < Lo) Lo = Raised;
            if (Raised > Hi) Hi = Raised;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    const Span = Math.max(Hi - Lo, 0.0001);
    for (let Index = 0; Index < Out.length; Index++)
    {
        const Unit = Math.min(Math.max((Out[Index] - Lo) / Span, 0.0), 1.0);
        Out[Index] = Math.pow(Unit, 1.36) * P.Amplitude;
    }
}

async function BuildCellularPlateau(Field, Layer, Out, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x2E91);
    const N     = Resolution;
    const Scale = TexelSize / Math.max(P.CellSize, 380.0);
    const Edge  = Math.max(P.EdgeWidth, 0.14);
    const HeightVariance = (P.HeightVariance !== undefined) ? P.HeightVariance : 0.65;
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const WarpX = Noise.Fractal(X * Scale * 0.55 + 8.8, Z * Scale * 0.55 + 1.9, 3, 2.0, 0.5) * 155.0;
            const WarpZ = Noise.Fractal(X * Scale * 0.55 - 4.3, Z * Scale * 0.55 + 12.7, 3, 2.0, 0.5) * 155.0;
            const [Cell, Identity] = Noise.CellularWithIdentity((X + WarpX) * Scale, (Z + WarpZ) * Scale);
            // Wadi-and-butte badlands: wide flat sand-sheeted wadi corridors separating eroded
            // sandstone mesas, cuestas and rocky outcrops across the full 2 km x 2 km domain.
            const WadiCorridor = Noise.Ridged((X + WarpX * 0.5) * TexelSize / 920.0 + 3.1, (Z + WarpZ * 0.5) * TexelSize / 920.0 - 2.4, 4, 2.02, 0.46, 1.35);
            let Butte = (Cell - 0.14) / Edge;
            Butte = Butte < 0.0 ? 0.0 : Butte > 1.0 ? 1.0 : Butte;
            Butte = Butte * Butte * (3.0 - 2.0 * Butte);
            const Level = 1.0 - HeightVariance * 0.50 * (1.0 - Identity);
            // Carve flat wadi basins where WadiCorridor < 0.42, rising into steep sandstone massifs above.
            let CorridorMask = (WadiCorridor - 0.34) / 0.46;
            CorridorMask = CorridorMask < 0.0 ? 0.0 : CorridorMask > 1.0 ? 1.0 : CorridorMask;
            CorridorMask = CorridorMask * CorridorMask * (3.0 - 2.0 * CorridorMask);
            const CragDetail = Noise.Ridged(X * TexelSize / 340.0 + 7.2, Z * TexelSize / 340.0 - 4.8, 3, 2.0, 0.45, 1.25);
            const Raised = CorridorMask * (0.58 * Butte * Level + 0.42 * CragDetail) + (1.0 - CorridorMask) * 0.06 * CragDetail;
            Out[Z * N + X] = Raised;
            if (Raised < Lo) Lo = Raised;
            if (Raised > Hi) Hi = Raised;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    const Span = Math.max(Hi - Lo, 0.0001);
    for (let Index = 0; Index < Out.length; Index++)
        Out[Index] = P.BaseElevation + ((Out[Index] - Lo) / Span) * P.Amplitude;
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  MODIFIER FIELDS
//--------------------------------------------------------------------------------------------------------------------------------------------


function SmoothStep(Edge0, Edge1, Val)
{
    const T = Math.min(1.0, Math.max(0.0, (Val - Edge0) / Math.max(Edge1 - Edge0, 1e-6)));
    return T * T * (3.0 - 2.0 * T);
}

function SoftPlus(Val, SharpK)
{
    const Prod = SharpK * Val;
    if (Prod > 30.0) return Val;
    if (Prod < -30.0) return 0.0;
    return Math.log1p(Math.exp(Prod)) / SharpK;
}

function DuneCrossSection(Frac, Crest, Lambda, Amp)
{
    if (Frac < Crest)
        return Math.pow(Frac / Math.max(Crest, 0.05), 1.7);
    const Run = (Frac - Crest) * Lambda;
    const SlipLen = Amp / Math.tan((33.0 * Math.PI) / 180.0);
    const T = Math.min(1.0, Run / Math.max(1e-3, SlipLen));
    const Toe = 0.25;
    const Y = T <= 1.0 - Toe ? 1.0 - T - Toe * 0.5 : ((1.0 - T) * (1.0 - T)) / (2.0 * Toe);
    return Y / (1.0 - Toe * 0.5);
}

// 📝 Ported from Slate CliffGenerator src/heightfield.js synthesizeBase: domain-warped 9-octave Musgrave
//    ridged multifractal + continental relief mask + escarpment headlands & sea stacks + softplus mesa
//    plateau + meandering canyon incision + compound barchanoid dunes.
async function BuildSlateLandform(Field, Layer, Out, Report, Cancel)
{
    const P          = Layer.Params;
    const N          = Resolution;
    const InvN       = 1.0 / (N - 1);
    const Seed       = Layer.Seed | 0;
    const Noise      = new SimplexNoise(Seed);
    const WarpNoise  = new SimplexNoise(Seed * 7 + 13);
    const MaskNoise  = new SimplexNoise(Seed * 3 + 101);
    const CanyonNoise = new SimplexNoise(Seed * 11 + 7);
    const CliffNoise = new SimplexNoise(Seed * 13 + 29);
    const DuneNoise  = new SimplexNoise(Seed * 17 + 23);

    const Freq           = P.BaseFrequency !== undefined ? P.BaseFrequency : 1.5;
    const WarpAmp        = (P.WarpStrength !== undefined ? P.WarpStrength : 0.6) * 0.35;
    const RidgeSharpness = P.RidgeSharpness !== undefined ? P.RidgeSharpness : 2.0;
    const PeakPower      = P.PeakPower !== undefined ? P.PeakPower : 1.35;
    const ReliefFreq     = P.ReliefFrequency !== undefined ? P.ReliefFrequency : 1.3;
    const ReliefContrast = P.ReliefContrast !== undefined ? P.ReliefContrast : 0.65;
    const MountainH      = P.MountainHeight !== undefined ? P.MountainHeight : 520.0;
    const BaseElev       = P.BaseElevation !== undefined ? P.BaseElevation : 40.0;
    const PlateauStr     = P.PlateauStrength || 0.0;
    const PlateauH       = P.PlateauHeight !== undefined ? P.PlateauHeight : 360.0;
    const CanyonDepth    = P.CanyonDepth || 0.0;
    const CanyonWidth    = P.CanyonWidth || 320.0;
    const CliffH         = P.CliffHeight || 0.0;
    const CliffSharp     = Math.min(1.0, Math.max(0.0, P.CliffSharpness !== undefined ? P.CliffSharpness : 0.85));
    const CliffEdgeW     = 0.5 * (1.0 - 0.97 * CliffSharp);
    const CliffStacks    = P.CliffStacks || 0.0;
    const DuneAmp        = P.DuneAmount || 0.0;
    const DuneLambda     = Math.max(10.0, P.DuneWavelength || 140.0);
    const DuneDir        = ((P.DuneDirection || 30.0) * Math.PI) / 180.0;
    const DuneCos        = Math.cos(DuneDir), DuneSin = Math.sin(DuneDir);
    const DuneCrest      = Math.min(0.95, Math.max(0.5, P.DuneAsymmetry !== undefined ? P.DuneAsymmetry : 0.68));
    const DuneCover      = P.DuneCoverage !== undefined ? P.DuneCoverage : 0.65;

    for (let J = 0; J < N; J++)
    {
        const V = J * InvN;
        for (let I = 0; I < N; I++)
        {
            const U = I * InvN;
            const Wx = WarpNoise.Fbm(U * Freq * 0.8 + 3.1, V * Freq * 0.8 + 1.7, 4, 2.0, 0.5);
            const Wy = WarpNoise.Fbm(U * Freq * 0.8 - 5.3, V * Freq * 0.8 + 8.9, 4, 2.0, 0.5);
            const Px = U * Freq + Wx * WarpAmp;
            const Py = V * Freq + Wy * WarpAmp;

            let R = Noise.Ridged(Px, Py, 8, 2.07, 0.5, RidgeSharpness);
            R = Math.pow(Math.max(R, 0.0), PeakPower);
            const Rolling = 0.5 + 0.5 * Noise.Fbm(Px * 2.3 + 40.0, Py * 2.3 - 12.0, 4, 2.0, 0.55);

            const M = 0.5 + 0.5 * MaskNoise.Fbm(U * ReliefFreq + 0.3, V * ReliefFreq - 0.6, 4, 2.0, 0.5);
            const Mask = SmoothStep(0.5 - ReliefContrast * 0.5, 0.5 + ReliefContrast * 0.5, M);

            let H = (R * Mask + Rolling * 0.08 * (1.0 - Mask * 0.5)) * MountainH;
            H += (Mask - 0.5) * MountainH * 0.25 + BaseElev;

            if (CliffH > 0.0)
            {
                const MEdge = 0.5 + 0.5 * MaskNoise.Fbm(U * ReliefFreq + 0.3, V * ReliefFreq - 0.6, 2, 2.0, 0.5);
                const Me = MEdge + 0.03 * CliffNoise.Fbm(U * 7.0 + 4.0, V * 7.0 - 2.0, 3);
                let Edge = SmoothStep(0.5 - CliffEdgeW, 0.5 + CliffEdgeW, Me);
                if (CliffStacks > 0.0 && Me < 0.5)
                {
                    const Band = SmoothStep(0.5 - 0.06, 0.5 - 0.03, Me) * (1.0 - SmoothStep(0.5 - 0.018, 0.5 - 0.004, Me));
                    const Blob = 0.5 + 0.5 * CliffNoise.Fbm(U * 22.0 + 9.0, V * 22.0 + 3.0, 2, 2.0, 0.5);
                    const Stack = SmoothStep(0.90 - 0.12 * CliffStacks, 0.94 - 0.12 * CliffStacks, Blob) * Band;
                    Edge = Math.max(Edge, Stack * (0.8 + 0.2 * Blob));
                }
                H += CliffH * Edge;
            }

            if (PlateauStr > 0.0)
            {
                const Cap = PlateauH;
                const SharpK = 220.0 + (8.0 - 220.0) * PlateauStr;
                const Soft = Cap - SoftPlus(Cap - H, SharpK) + SoftPlus(H - Cap, SharpK) * (1.0 - PlateauStr);
                H = H + (Soft - H) * PlateauStr;
            }

            if (CanyonDepth > 0.0)
            {
                const Cx = 0.5 + 0.22 * CanyonNoise.Fbm(V * 1.6 + 2.0, 0.37, 3, 2.0, 0.5)
                         + 0.04 * CanyonNoise.Fbm(V * 6.0 + 9.0, 1.21, 3, 2.0, 0.5);
                const Dist = Math.abs(U - Cx) * WorldExtent;
                const HalfW = CanyonWidth * 0.5;
                const Profile = 1.0 - SmoothStep(HalfW * 0.25, HalfW, Dist);
                const FloorNoise = 1.0 + 0.15 * Noise.Fbm(U * 20.0, V * 20.0, 3);
                H -= CanyonDepth * Profile * FloorNoise;
            }

            if (DuneAmp > 0.0)
            {
                const Xw = (U - 0.5) * WorldExtent, Zw = (V - 0.5) * WorldExtent;
                const Bend = DuneNoise.Fbm(U * 3.0 + 11.0, V * 3.0 - 4.0, 3) * 0.6 + DuneNoise.Fbm(U * 9.0 + 2.0, V * 9.0 + 6.0, 2) * 0.12;
                const SCoord = (Xw * DuneCos + Zw * DuneSin) / DuneLambda + Bend;
                const Frac = SCoord - Math.floor(SCoord);
                const Profile = DuneCrossSection(Frac, DuneCrest, DuneLambda, DuneAmp);
                const FieldMask = SmoothStep(0.5 - DuneCover * 0.5, 0.5 + DuneCover * 0.35, 0.5 + 0.5 * DuneNoise.Fbm(U * 2.2 + 31.0, V * 2.2 + 7.0, 3));
                const S2 = SCoord * 2.6 + Bend * 2.5 + DuneNoise.Fbm(U * 6.0 + 17.0, V * 6.0 - 9.0, 2) * 0.8;
                const Fr2 = S2 - Math.floor(S2);
                const Minor = (Fr2 < 0.7 ? Math.pow(Fr2 / 0.7, 1.5) : 1.0 - SmoothStep(0.7, 1.0, Fr2)) * 0.07 * SmoothStep(0.15, 0.60, Frac) * (Frac < DuneCrest ? 1.0 : 0.1);
                const Local = 0.75 + 0.25 * DuneNoise.Fbm(U * 5.0 + 3.0, V * 5.0 + 9.0, 2);
                H += DuneAmp * (Profile + Minor) * FieldMask * Local;
            }

            Out[J * N + I] = H;
        }
        if ((J & 63) === 0)
        {
            Report(J / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
}

// 📝 Ported from Slate CliffGenerator src/heightfield.js makeStacks: Gaea-style tiered rock stacks,
//    hoodoos and sandstone spires with heavy-tailed cluster scatter, plan lean walk and talus pedestals.
async function BuildRockStacks(Field, Layer, Out, Report, Cancel)
{
    const P        = Layer.Params;
    const N        = Resolution;
    const InvN     = 1.0 / (N - 1);
    const Amp      = P.StackHeight !== undefined ? P.StackHeight : 145.0;
    const Levels   = Math.max(1, Math.min(16, Math.round(P.StackLevels !== undefined ? P.StackLevels : 6)));
    const Scale    = Math.max(25.0, P.StackScale || 210.0);
    const Taper    = P.StackTaper !== undefined ? P.StackTaper : 0.5;
    const Sharp    = P.StackSharpness !== undefined ? P.StackSharpness : 0.85;
    const Chaos    = P.StackChaos !== undefined ? P.StackChaos : 0.6;
    const Spires   = P.StackSpires !== undefined ? P.StackSpires : 0.25;
    const Cover    = P.StackCoverage !== undefined ? P.StackCoverage : 0.62;
    const Pedestal = P.StackPedestal !== undefined ? P.StackPedestal : 0.45;
    const SizeVar  = P.StackSizeVar !== undefined ? P.StackSizeVar : 0.75;
    const Elong    = P.StackElongation !== undefined ? P.StackElongation : 0.48;
    const Grouping = P.StackCluster !== undefined ? P.StackCluster : 0.5;
    const Seed     = Layer.Seed | 0;
    const N2       = new SimplexNoise(Seed * 29 + 17);

    const TTop = 0.85 * Taper;
    const Tiers = [];
    let ThickSum = 0.0;
    for (let K = 0; K < Levels; K++)
    {
        const Thick = 0.45 + 1.1 * HashCoords(K, 1, Seed + 5);
        ThickSum += Thick;
        const Ang = HashCoords(K, 2, Seed + 5) * Math.PI * 2.0;
        Tiers.push({
            Thick,
            T:  Levels > 1 ? (TTop * K) / (Levels - 1) : 0.0,
            W:  (0.16 + (0.015 - 0.16) * Sharp) * (0.6 + 0.8 * HashCoords(K, 3, Seed + 5)),
            Ox: Math.cos(Ang) * Chaos * 0.045,
            Oz: Math.sin(Ang) * Chaos * 0.045,
            Ph: K * 7.3,
            H:  0.0,
        });
    }
    for (const Tier of Tiers)
        Tier.H = (Tier.Thick / ThickSum) * Amp;

    const FreqF = WorldExtent / Scale;
    const CellS = 1.0 + (0.52 - 1.0) * Spires;
    const RMul  = 1.0 + (0.78 - 1.0) * Spires;
    const Ks    = 0.07;
    const OutBlob = new Float64Array(5);

    const EvalBlobs = (Px, Pz) =>
    {
        const Cx = Math.floor(Px / CellS), Cz = Math.floor(Pz / CellS);
        let Acc = 0.0, WSum = 0.0, Hs = 0.0, Tf = 0.0, Lx = 0.0, Lz = 0.0;
        for (let Dz = -2; Dz <= 2; Dz++)
        {
            for (let Dx = -2; Dx <= 2; Dx++)
            {
                const Ix = Cx + Dx, Iz = Cz + Dz;
                if (HashCoords(Ix, Iz, Seed + 43) > 0.84 - 0.16 * Grouping)
                    continue;
                const H0 = HashCoords(Ix * 3, Iz * 5 + 2, Seed + 61);
                const Count = Grouping > 0.02 ? (H0 < 0.30 + 0.34 * Grouping ? 3 : H0 < 0.56 + 0.20 * Grouping ? 2 : 1) : (H0 < 0.80 ? 1 : 0);
                const Ax0 = (Ix + 0.16 + 0.68 * HashCoords(Ix, Iz, Seed + 31)) * CellS;
                const Az0 = (Iz + 0.16 + 0.68 * HashCoords(Ix, Iz, Seed + 37)) * CellS;
                for (let Sub = 0; Sub < Count; Sub++)
                {
                    const Hh  = HashCoords(Ix * 7 + Sub * 5, Iz * 13 - Sub * 3, Seed + 71);
                    const Off = Sub === 0 ? 0.0 : CellS * (0.20 + 0.20 * Hh);
                    const Oa  = HashCoords(Ix + Sub * 11, Iz - Sub * 7, Seed + 83) * Math.PI * 2.0;
                    const Fx  = Ax0 + Math.cos(Oa) * Off, Fz = Az0 + Math.sin(Oa) * Off;
                    const Ddx = Px - Fx, Ddz = Pz - Fz;
                    const Far = CellS * 1.6 + Off;
                    if (Ddx * Ddx + Ddz * Ddz > Far * Far)
                        continue;
                    const Ha = HashCoords(Ix + Sub, Iz * 3 + 1, Seed + 41);
                    const Hb = HashCoords(Ix * 5 - Sub, Iz + Sub * 2, Seed + 97);
                    const Hc = HashCoords(Ix - Sub * 4, Iz * 11 + Sub, Seed + 103);
                    const Hd = HashCoords(Ix * 3 + Sub, Iz + Sub * 7, Seed + 109);
                    const Rad = CellS * RMul * (0.20 + 0.15 * Ha) * (0.80 + 0.85 * Math.pow(Hb, 1.0 + 2.4 * SizeVar)) * (Sub === 0 ? 1.0 : 0.7);
                    if (Rad < 0.03)
                        continue;
                    const Ca  = Math.cos(Hc * Math.PI), Sa = Math.sin(Hc * Math.PI);
                    const Asp = 1.0 + Elong * 2.2 * Hd;
                    const Sq  = 0.12 + 0.62 * Hb;
                    const Ax  = (Ddx * Ca + Ddz * Sa) / (Rad * Asp);
                    const Az  = (-Ddx * Sa + Ddz * Ca) / Rad;
                    const Ex  = Math.max(Math.abs(Ax), 1e-6), Ez = Math.abs(Az);
                    const Metric = (1.0 - Sq) * Math.hypot(Ex, Ez) + Sq * Math.max(Ex, Ez);
                    const Val = 1.0 - Metric;
                    if (Val < -3.2 * Ks)
                        continue;
                    const Wgt = Math.exp(Val / Ks);
                    Acc += Wgt;
                    WSum += Wgt;
                    Hs += Wgt * (0.52 + 0.82 * Math.pow(Ha, 1.0 + 1.7 * SizeVar));
                    Tf += Wgt * (0.50 + 1.0 * Hd);
                    Lx += Wgt * Math.cos(Hb * Math.PI * 2.0) * Chaos * 0.14 * (0.4 + Hc);
                    Lz += Wgt * Math.sin(Hb * Math.PI * 2.0) * Chaos * 0.14 * (0.4 + Hc);
                }
            }
        }
        OutBlob[0] = Acc > 0.0 ? Math.min(1.12, Ks * Math.log(Acc)) : -2.0;
        if (WSum <= 0.0)
        {
            OutBlob[1] = 1.0; OutBlob[2] = 1.0; OutBlob[3] = 0.0; OutBlob[4] = 0.0;
            return OutBlob;
        }
        OutBlob[1] = Hs / WSum;
        OutBlob[2] = Tf / WSum;
        OutBlob[3] = Lx / WSum;
        OutBlob[4] = Lz / WSum;
        return OutBlob;
    };

    const SampleStackField = (Px, Pz) =>
    {
        const W1 = 0.15 + 0.20 * Chaos;
        const Wx = N2.Fbm(Px * 1.1 + 1.3, Pz * 1.1 + 5.1, 3) * W1 + N2.Fbm(Px * 3.6 - 2.2, Pz * 3.6 + 7.7, 2) * W1 * 0.5;
        const Wz = N2.Fbm(Px * 1.1 - 7.7, Pz * 1.1 + 2.9, 3) * W1 + N2.Fbm(Px * 3.6 + 4.4, Pz * 3.6 - 6.1, 2) * W1 * 0.5;
        return EvalBlobs(Px + Wx, Pz + Wz);
    };

    // Pre-sample the smooth blob union on a 257x257 grid, then evaluate the sharp tier steps at full 1024x1024 resolution.
    const GridM = 257;
    const GridM0 = new Float32Array(GridM * GridM);
    const GridM1 = new Float32Array(GridM * GridM);
    const GridHs = new Float32Array(GridM * GridM);
    const GridTf = new Float32Array(GridM * GridM);
    for (let Gj = 0; Gj < GridM; Gj++)
    {
        const V = Gj / (GridM - 1);
        for (let Gi = 0; Gi < GridM; Gi++)
        {
            const U = Gi / (GridM - 1);
            const Px = U * FreqF, Pz = V * FreqF;
            const Res0 = SampleStackField(Px, Pz);
            const Idx = Gj * GridM + Gi;
            const M0 = Res0[0], Hs = Res0[1], Tf = Res0[2], Lx = Res0[3], Lz = Res0[4];
            GridM0[Idx] = M0;
            GridHs[Idx] = Hs;
            GridTf[Idx] = Tf;
            GridM1[Idx] = (Chaos > 0.01 && M0 > -0.8) ? SampleStackField(Px + Lx * 2.2, Pz + Lz * 2.2)[0] : M0;
        }
        if ((Gj & 31) === 0)
        {
            Report(0.45 * (Gj / GridM));
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }

    const BilinearGrid = (Arr, U, V) =>
    {
        const Gx = U * (GridM - 1), Gz = V * (GridM - 1);
        const I0 = Math.min(GridM - 2, Math.max(0, Math.floor(Gx)));
        const J0 = Math.min(GridM - 2, Math.max(0, Math.floor(Gz)));
        const Fu = Gx - I0, Fv = Gz - J0;
        const Base = J0 * GridM + I0;
        return (Arr[Base] * (1.0 - Fu) + Arr[Base + 1] * Fu) * (1.0 - Fv)
             + (Arr[Base + GridM] * (1.0 - Fu) + Arr[Base + GridM + 1] * Fu) * Fv;
    };

    const Edge = 0.5 + (0.5 - Cover) * 0.8;
    for (let J = 0; J < N; J++)
    {
        const V = J * InvN;
        for (let I = 0; I < N; I++)
        {
            const U = I * InvN;
            const CovMask = Cover >= 1.0 ? 1.0 : SmoothStep(Edge - 0.08, Edge + 0.08, 0.5 + 0.5 * N2.Fbm(U * 1.4 + 23.0, V * 1.4 - 11.0, 3));
            if (CovMask <= 0.001)
            {
                Out[J * N + I] = 0.0;
                continue;
            }
            const Sink = (1.0 - CovMask) * 0.7;
            const M0 = BilinearGrid(GridM0, U, V) - Sink;
            if (M0 < -0.6)
            {
                Out[J * N + I] = 0.0;
                continue;
            }
            const M1 = BilinearGrid(GridM1, U, V) - Sink;
            const Hs = Math.max(0.18, Math.min(1.5, BilinearGrid(GridHs, U, V)));
            const Tf = BilinearGrid(GridTf, U, V);
            const Px = U * FreqF, Pz = V * FreqF;
            let H = 0.0, Below = 1.0;
            for (let K = 0; K < Levels; K++)
            {
                const Tier = Tiers[K];
                const S = Levels > 1 ? K / (Levels - 1) : 0.0;
                const Mk = M0 + (M1 - M0) * S + Chaos * 0.05 * N2.Fbm(Px * 6.0 + Tier.Ph, Pz * 6.0 - Tier.Ph, 2) + Tier.Ox * (1.0 - S) - Tier.Oz * S;
                const Thresh = (Tier.T * Tf) / Hs;
                const Sk = SmoothStep(Thresh - Tier.W, Thresh + Tier.W, Mk) * Below;
                H += Hs * Tier.H * Sk * (1.0 + 0.05 * Math.max(0.0, Mk - Thresh));
                Below = Sk;
                if (K === 0 && Pedestal > 0.0)
                {
                    const Ramp = SmoothStep(-0.55, -Tier.W, M0);
                    H += Amp * 0.22 * Pedestal * Math.pow(Ramp, 1.6) * (1.0 - Sk) * (0.45 + 0.75 * Math.min(1.4, Hs));
                }
            }
            Out[J * N + I] = H;
        }
        if ((J & 63) === 0)
        {
            Report(0.45 + 0.55 * (J / N));
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
}

async function ApplyDomainWarp(Field, Layer, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x09D4);
    const N     = Resolution;
    const Source = new Float32Array(Field.Heights);
    const Scale = TexelSize / P.Wavelength;
    const Texels = P.StrengthMetres / TexelSize;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const OffsetX = Noise.Fractal(X * Scale + 41.2, Z * Scale + 3.3, 3, 2.0, 0.5) * Texels;
            const OffsetZ = Noise.Fractal(X * Scale + 9.6,  Z * Scale + 27.5, 3, 2.0, 0.5) * Texels;
            Field.Heights[Z * N + X] = Field.SampleBilinear(Source, (X + OffsetX + 0.5) * TexelSize - WorldExtent * 0.5,
                                                                    (Z + OffsetZ + 0.5) * TexelSize - WorldExtent * 0.5);
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
}

async function ApplyStrataTerrace(Field, Layer, Report, Cancel)
{
    ApplyStrataPackages(Field, { ...Layer.Params, Seed: Layer.Seed }, Field.OutcropMask || null);
    Cancel.ThrowIfRequested();
    await YieldBriefly();
    Report(1.0);
}

function ApplySculptDelta(Field)
{
    const Heights = Field.Heights;
    const Delta   = Field.SculptDelta;
    for (let Index = 0; Index < Heights.length; Index++)
        Heights[Index] += Delta[Index];
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  LAYER TYPE REGISTRY
//--------------------------------------------------------------------------------------------------------------------------------------------

export const LayerTypes =
[
    {
        Id: "ContinentalMass", Label: "Continental mass", Group: "Formation", Glyph: "massif",
        Blurb: "Warped fractal landmass. Plateau shaping flattens the uplands.",
        Params:
        [
            Param("Amplitude",     "Relief amplitude",  10, 1600, 5,   420, "m"),
            Param("BaseElevation", "Base elevation",    -400, 800, 5,  0,   "m"),
            Param("Wavelength",    "Feature wavelength", 180, 2400, 10, 900, "m"),
            Param("Octaves",       "Octaves",            1, 9, 1,      6,   ""),
            Param("Gain",          "Octave gain",        0.3, 0.75, 0.01, 0.52, ""),
            Param("Warp",          "Domain warp",        0, 400, 5,    140, "m"),
            Param("Plateau",       "Plateau shaping",    0, 1, 0.01,   0.15, ""),
            Param("Tilt",          "Regional tilt",      -500, 500, 5,  0,   "m"),
            Param("TiltAngle",     "Tilt bearing",       0, 360, 1,     35,  "°"),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildContinentalMass(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "RidgeUplift", Label: "Ridge uplift", Group: "Formation", Glyph: "ridge",
        Blurb: "Ridged multifractal crests under a soft continental envelope.",
        Params:
        [
            Param("Amplitude",  "Crest amplitude",    10, 1800, 5,   560, "m"),
            Param("Wavelength", "Feature wavelength", 150, 1800, 10, 640, "m"),
            Param("Octaves",    "Octaves",            1, 9, 1,       6,   ""),
            Param("Sharpness",  "Crest sharpness",    0.6, 3.2, 0.05, 1.6, ""),
            Param("Warp",       "Domain warp",        0, 400, 5,     120, "m"),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildRidgeUplift(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "TectonicFront", Label: "Tectonic front", Group: "Formation", Glyph: "front",
        Blurb: "A meandering plate boundary: one great uplifted arc with a ridged crest.",
        Params:
        [
            Param("Amplitude",      "Uplift amplitude", 10, 2000, 5,   900, "m"),
            Param("Angle",          "Front bearing",    0, 360, 1,     115, "°"),
            Param("Offset",         "Front offset",     -900, 900, 5,  -120, "m"),
            Param("Width",          "Uplift width",     60, 900, 5,    330, "m"),
            Param("Asymmetry",      "Front asymmetry",  0, 1, 0.01,    0.55, ""),
            Param("Meander",        "Front meander",    0, 500, 5,     210, "m"),
            Param("Waviness",       "Meander wavelength", 300, 2400, 10, 1100, "m"),
            Param("CrestWavelength","Crest wavelength", 120, 1200, 10, 420, "m"),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildTectonicFront(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "CellularPlateau", Label: "Cellular plateau", Group: "Formation", Glyph: "mesa",
        Blurb: "Worley-cell mesas with creased borders — inselberg country.",
        Params:
        [
            Param("Amplitude",     "Mesa amplitude",  10, 900, 5,    190, "m"),
            Param("BaseElevation", "Base elevation",   -200, 600, 5,  0,   "m"),
            Param("CellSize",      "Cell size",        120, 900, 5,   380, "m"),
            Param("EdgeWidth",     "Edge softness",    0.05, 0.9, 0.01, 0.4, ""),
            Param("HeightVariance", "Remnant height variance", 0, 0.95, 0.01, 0.65, ""),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildCellularPlateau(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "DomainWarp", Label: "Domain warp", Group: "Formation", Glyph: "warp",
        Blurb: "Re-samples everything beneath through a swirling offset field.",
        Params:
        [
            Param("StrengthMetres", "Warp displacement", 0, 500, 5,  150, "m"),
            Param("Wavelength",     "Warp wavelength",   200, 2000, 10, 800, "m"),
        ],
        Modify: (Field, Layer, Report, Cancel) => ApplyDomainWarp(Field, Layer, Report, Cancel),
    },
    {
        Id: "SlateLandform", Label: "Slate landform & cliffs", Group: "Formation", Glyph: "massif",
        Blurb: "Domain-warped Musgrave ridged mountains, continental relief mask, escarpment cliffs & sea stacks, softplus mesa plateaus, meandering canyons and compound dunes.",
        Params:
        [
            Param("MountainHeight",  "Mountain height",   10, 2200, 5,   520, "m"),
            Param("BaseElevation",   "Base elevation",    -300, 600, 5,  40,  "m"),
            Param("BaseFrequency",   "Base frequency",    0.4, 4.0, 0.05, 1.6, ""),
            Param("RidgeSharpness",  "Ridge sharpness",   0.6, 3.8, 0.05, 2.0, ""),
            Param("PeakPower",       "Peak power",        0.5, 2.4, 0.05, 1.35, ""),
            Param("WarpStrength",    "Domain warp",       0, 1.5, 0.05,  0.6, ""),
            Param("ReliefFrequency", "Continent freq",    0.4, 3.0, 0.05, 1.3, ""),
            Param("ReliefContrast",  "Continent contrast",0.1, 1.0, 0.05, 0.65, ""),
            Param("CliffHeight",     "Escarpment cliff",  0, 600, 5,     0,   "m"),
            Param("CliffSharpness",  "Escarpment brink",  0.1, 1.5, 0.05, 0.9, ""),
            Param("CliffStacks",     "Offshore sea stacks", 0, 1.0, 0.05, 0,  ""),
            Param("PlateauStrength", "Mesa plateau",      0, 1.0, 0.05,  0,   ""),
            Param("PlateauHeight",   "Mesa cap height",   40, 900, 5,    340, "m"),
            Param("CanyonDepth",     "Canyon incision",   0, 500, 5,     0,   "m"),
            Param("CanyonWidth",     "Canyon width",      80, 700, 10,   320, "m"),
            Param("DuneAmount",      "Dune relief",       0, 120, 1,     0,   "m"),
            Param("DuneWavelength",  "Dune wavelength",   40, 400, 5,    140, "m"),
            Param("DuneDirection",   "Wind bearing",      0, 360, 1,     35,  "°"),
            Param("DuneAsymmetry",   "Slip asymmetry",    0.5, 0.95, 0.02, 0.72, ""),
            Param("DuneCoverage",    "Dune field cover",  0.1, 1.0, 0.05, 0.68, ""),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildSlateLandform(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "RockStacks", Label: "Rock stacks (Gaea Stacks)", Group: "Formation", Glyph: "mesa",
        Blurb: "Tiered Gaea-style sandstone towers, hoodoos and spires with heavy-tailed size spread, leaning tiers and talus pedestals.",
        Params:
        [
            Param("StackHeight",     "Stack height",      10, 400, 5,    145, "m"),
            Param("StackLevels",     "Tier levels",       1, 12, 1,      6,   ""),
            Param("StackScale",      "District scale",    60, 400, 5,    210, "m"),
            Param("StackTaper",      "Pyramid taper",     0.1, 1.0, 0.05, 0.5, ""),
            Param("StackSharpness",  "Riser sharpness",   0.2, 1.0, 0.05, 0.85, ""),
            Param("StackChaos",      "Plan chaos & lean", 0, 1.0, 0.05,  0.6, ""),
            Param("StackSpires",     "Spire narrowing",   0, 1.0, 0.05,  0.25, ""),
            Param("StackCoverage",   "Field coverage",    0.1, 1.0, 0.05, 0.62, ""),
            Param("StackPedestal",   "Talus pedestal",    0, 1.0, 0.05,  0.45, ""),
            Param("StackSizeVar",    "Size spread",       0, 1.0, 0.05,  0.75, ""),
            Param("StackElongation", "Fin elongation",    0, 1.0, 0.05,  0.48, ""),
            Param("StackCluster",    "Tower clustering",  0, 1.0, 0.05,  0.5, ""),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildRockStacks(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "RuggedPushPull", Label: "Rugged push–pull cliffs", Group: "Formation", Glyph: "crag",
        Blurb: "Pushes and pulls steep cliff faces horizontally along their outward normal into blocky 3D buttresses, chimneys and stepped ledges.",
        Params:
        [
            Param("Amount",     "Push–pull distance", 0, 40, 0.5,  14.0, "m"),
            Param("Scale",      "Buttress scale",     20, 160, 2,  65.0, "m"),
            Param("Blockiness", "Blockiness",         0, 1, 0.05,  0.75, ""),
            Param("Ledges",     "Vertical ledges",    0, 1.5, 0.05, 0.5, ""),
            Param("Bands",      "Elevation bands",    1, 8, 1,     3,    ""),
            Param("SlopeMin",   "Cliff threshold",    15, 55, 1,   28,   "°"),
        ],
        Modify: async (Field, Layer, Report) =>
        {
            RuggedPushPull(Field, { ...Layer.Params, Seed: Layer.Seed });
            Report(1.0);
        },
    },
    {
        Id: "BoulderTors", Label: "Boulder tors & core-stones", Group: "Formation", Glyph: "crag",
        Blurb: "Unions clusters of rotated superellipsoid granite tors & woolsack core-stones into ridges and hilltops before strata and erosion.",
        Params:
        [
            Param("Density",   "Cluster density",  0, 1, 0.05,    0.55, ""),
            Param("Size",      "Core-stone size",  6, 36, 1,      16.0, "m"),
            Param("Spacing",   "Cluster spacing",  80, 360, 5,    190,  "m"),
            Param("Count",     "Stones / cluster", 1, 12, 1,      6,    ""),
            Param("RidgeBias", "Ridge preference", 0, 1, 0.05,    0.65, ""),
            Param("SlopeMax",  "Max ground slope", 10, 55, 1,     28,   "°"),
            Param("Weather",   "Rounding weather", 0, 1, 0.05,    0.55, ""),
        ],
        Modify: async (Field, Layer, Report) =>
        {
            Field.OutcropMask = AddBoulderTors(Field, { ...Layer.Params, Seed: Layer.Seed });
            Report(1.0);
        },
    },
    {
        Id: "StrataTerrace", Label: "Strata terrace", Group: "Formation", Glyph: "strata",
        Blurb: "Stratigraphic bed packages (thin-bedded shales, massive sandstone/limestone caps, gradational bases) with geological dip and lateral thickness jitter.",
        Params:
        [
            Param("BandMetres",      "Mean bed thickness", 4, 120, 1,     24,   "m"),
            Param("TerraceStrength", "Terrace strength",   0, 1, 0.01,    0.80, ""),
            Param("HardContrast",    "Hardness contrast",  0, 1, 0.01,    0.85, ""),
            Param("Dip",             "Geological dip",     0, 35, 0.5,    4.0,  "°"),
            Param("DipDirection",    "Dip bearing",        0, 360, 1,     35,   "°"),
            Param("Variation",       "Thickness variation",0, 1.5, 0.05,  0.60, ""),
            Param("Packaging",       "Package grouping",   0, 1, 0.05,    0.60, ""),
            Param("HardShare",       "Hard bed share",     0.1, 0.9, 0.05,0.40, ""),
            Param("Lateral",         "Lateral bed pinch",  0, 0.8, 0.02,  0.24, ""),
            Param("RiserWidth",      "Riser share",        0.08, 0.8, 0.01, 0.4, ""),
        ],
        Modify: (Field, Layer, Report, Cancel) => ApplyStrataTerrace(Field, Layer, Report, Cancel),
    },
    {
        Id: "FluvialIncision", Label: "River erosion", Group: "Erosion", Glyph: "river",
        Blurb: "Drainage solution + stream-power incision with downstream sediment transport: what the river cannot carry it lays down as floodplains, fans and deltas. Writes Flow, Water, Deposition.",
        Params:
        [
            Param("Strength",      "Incision strength",  0, 3, 0.05,   1.0,  ""),
            Param("Iterations",    "Incision iterations", 1, 6, 1,     2,    ""),
            Param("Sedimentation", "Sedimentation",       0, 1, 0.01,   0.55, ""),
            Param("Capacity",      "Sediment capacity",   0.2, 3, 0.05, 1.0,  "x"),
        ],
        Modify: (Field, Layer, Report, Cancel) => FluvialIncision(Field, Layer.Params, Report, Cancel),
    },
    {
        Id: "HydraulicErosion", Label: "Hydraulic erosion", Group: "Erosion", Glyph: "droplet",
        Blurb: "Droplet sediment transport. Writes Wear and Deposition.",
        Params:
        [
            Param("Droplets",    "Droplets",        5000, 600000, 5000, 160000, ""),
            Param("Inertia",     "Droplet inertia", 0, 0.9, 0.01,       0.28,   ""),
            Param("Capacity",    "Sediment capacity", 1, 12, 0.1,        4.5,    ""),
            Param("ErodeRate",   "Erosion rate",    0.05, 0.9, 0.01,     0.32,   ""),
            Param("DepositRate", "Deposition rate", 0.05, 0.9, 0.01,     0.30,   ""),
            Param("Radius",      "Erosion radius",  1, 4, 1,             2,      "texels"),
        ],
        Modify: (Field, Layer, Report, Cancel) =>
            HydraulicErosion(Field, { ...Layer.Params, Seed: Layer.Seed }, Report, Cancel),
    },
    {
        Id: "GlacialPolish", Label: "Glacial polish", Group: "Erosion", Glyph: "glacier",
        Blurb: "Widens trunk valleys into U troughs where Flow runs high.",
        Params:
        [
            Param("Strength",     "Polish strength", 0, 1, 0.01,    0.6,  ""),
            Param("WidthTexels",  "Trough half-width", 2, 40, 1,    12,   "texels"),
            Param("ScourMetres",  "Centreline scour", 0, 40, 0.5,   8,    "m"),
        ],
        Modify: (Field, Layer, Report, Cancel) => GlacialPolish(Field, Layer.Params, Report, Cancel),
    },
    {
        Id: "ThermalErosion", Label: "Thermal erosion", Group: "Erosion", Glyph: "talus",
        Blurb: "Talus relaxation: nothing rests steeper than its angle of repose. Where strata hardness varies, hard beds stand at the cliff angle and soft beds bench below them.",
        Params:
        [
            Param("Iterations", "Iterations",   1, 240, 1,      60,   ""),
            Param("TalusAngle", "Talus angle (soft beds)",  15, 60, 0.5,    34,   "°"),
            Param("CliffAngle", "Cliff angle (hard beds)",  20, 85, 0.5,    68,   "°"),
            Param("Rate",       "Relaxation rate", 0.05, 0.5, 0.01, 0.5, ""),
        ],
        Modify: (Field, Layer, Report, Cancel) => ThermalErosion(Field, Layer.Params, Report, Cancel),
    },
    {
        Id: "AeolianSettle", Label: "Aeolian settle", Group: "Erosion", Glyph: "wind",
        Blurb: "Saltation slabs: sand lifts, hops, and settles in wind shadow.",
        Params:
        [
            Param("WindAngle", "Wind bearing", 0, 360, 1,      35,     "°"),
            Param("Slabs",     "Sand slabs",   5000, 600000, 5000, 140000, ""),
        ],
        Modify: (Field, Layer, Report, Cancel) =>
            AeolianSettle(Field, { ...Layer.Params, Seed: Layer.Seed }, Report, Cancel),
    },
    {
        Id: "SnowAccumulation", Label: "Snow accumulation", Group: "Surface", Glyph: "snow",
        Blurb: "Altitude- and slope-gated snowpack with hollow drift. Writes Snow.",
        Params:
        [
            Param("Snowline",   "Snowline",        -200, 1800, 5,   620, "m"),
            Param("Band",       "Transition band", 10, 400, 5,      120, "m"),
            Param("SlopeLimit", "Holding slope",   15, 75, 1,       48,  "°"),
            Param("Depth",      "Pack depth",      0, 12, 0.1,      2.5, "m"),
        ],
        Modify: (Field, Layer, Report, Cancel) =>
            SnowAccumulation(Field, Layer.Params, new LatticeNoise(Layer.Seed ^ 0x3F77), Report, Cancel),
    },
    {
        Id: "RockOutcrops", Label: "Rugged outcrops & rocks", Group: "Surface", Glyph: "crag",
        Blurb: "Gaea-style fractured bedrock outcrops jutting from ridges & flanks plus angular talus boulders on scree aprons.",
        Params:
        [
            Param("OutcropAmplitude", "Outcrop crag height", 0, 28, 0.5, 12.0, "m"),
            Param("RockAmplitude",    "Talus boulder size",  0, 10, 0.2, 3.6,  "m"),
            Param("Density",          "Outcrop coverage",    0.1, 0.95, 0.02, 0.64, ""),
        ],
        Modify: async (Field, Layer, Report) =>
        {
            ApplyRuggedOutcropsAndRocks(Field, { ...Layer.Params, Seed: Layer.Seed });
            Report(1.0);
        },
    },
    {
        Id: "CaveNetwork", Label: "Cave system (SDF)", Group: "Formation", Glyph: "arch",
        Blurb: "Carves 3D voxel signed-distance caves, vaulted tunnels and cliff overhangs directly into steep rock walls.",
        Params:
        [
            Param("CaveCount",   "Cave mouths",   1, 10, 1,   4,  ""),
            Param("Aperture",    "Cave aperture", 12, 68, 1,  26, "m"),
            Param("TunnelDepth", "Tunnel depth",  30, 220, 5, 95, "m"),
            Param("Blend",       "Lip rounding",  4, 24, 1,   10, "m"),
        ],
        Modify: async (Field, Layer, Report) => { BuildProceduralCaves(Field, Layer); Report(1.0); },
    },
    {
        Id: "SculptDelta", Label: "Sculpt layer", Group: "Sculpt", Glyph: "sculpt",
        Blurb: "Height strokes painted into this sculpt layer. Combine or mask with the B&W mask brush.",
        Params: [],
        Modify: async (Field, Layer, Report) => { ApplySculptDelta(Field); Report(1.0); },
    },
];

export function LayerTypeById(Id)
{
    return LayerTypes.find((Type) => Type.Id === Id) || null;
}

let NextLayerSerial = 1;

export function ConstructLayer(TypeId, Overrides)
{
    const Type = LayerTypeById(TypeId);
    const Params = {};
    for (const Definition of Type.Params)
        Params[Definition.Key] = Definition.Default;
    const Layer =
    {
        Serial       : NextLayerSerial++,
        TypeId       : TypeId,
        Label        : Type.Label,
        Enabled      : true,
        Blend        : Type.Build ? "Add" : "Replace",
        Strength     : 1.0,
        MaskChannel  : "",
        MaskLow      : 0.0,
        MaskHigh     : 1.0,
        MaskInvert   : false,
        Seed         : 1234 + NextLayerSerial * 777,
        Params       : Params,
    };
    if (Overrides)
    {
        const { Params: ParamOverrides, ...Rest } = Overrides;
        Object.assign(Layer, Rest);
        if (ParamOverrides)
            Object.assign(Layer.Params, ParamOverrides);
    }
    return Layer;
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  EVALUATION
//--------------------------------------------------------------------------------------------------------------------------------------------

export class LayerStackEvaluation
{
    constructor(Field)
    {
        this.Field         = Field;
        this.Cache         = [];        // relief snapshot after each layer index
        this.UnmaskedCache = [];        // pre-mask snapshot per layer for instant B&W mask blending
        this.Scratch       = new Float32Array(Resolution * Resolution);
    }

    InvalidateFrom(Index)
    {
        this.Cache.length = Math.min(this.Cache.length, Index);
        this.UnmaskedCache.length = Math.min(this.UnmaskedCache.length, Index);
    }

    BuildMaskWeights(Layer)
    {
        const Field = this.Field;
        if (!Layer.MaskChannel)
            return null;
        const Weights = new Float32Array(Resolution * Resolution);
        if (Layer.MaskChannel === "Height")
        {
            Field.MeasureRange();   // mask against the relief as it stands now, not last build's range
            const Range = Math.max(Field.Maximum - Field.Minimum, 1.0);
            for (let Index = 0; Index < Weights.length; Index++)
                Weights[Index] = MaskWeight((Field.Heights[Index] - Field.Minimum) / Range, Layer.MaskLow, Layer.MaskHigh, Layer.MaskInvert);
        }
        else if (Layer.MaskChannel === "Slope")
        {
            for (let Z = 0; Z < Resolution; Z++)
            {
                for (let X = 0; X < Resolution; X++)
                {
                    const Slope = SlopeAt(Field.Heights, X, Z);
                    Weights[Z * Resolution + X] = MaskWeight(Slope / (Slope + 0.9), Layer.MaskLow, Layer.MaskHigh, Layer.MaskInvert);
                }
            }
        }
        else
        {
            const Samples = Field.ChannelSamples(Layer.MaskChannel);
            if (!Samples)
                return null;
            for (let Index = 0; Index < Weights.length; Index++)
                Weights[Index] = MaskWeight(Samples[Index], Layer.MaskLow, Layer.MaskHigh, Layer.MaskInvert);
        }
        return Weights;
    }

    // 📝 Runs the stack from FromIndex (or the first uncached layer) to the top.
    //    Report receives (StageLabel, OverallFraction).
    async Evaluate(Layers, FromIndex, Report, Cancel)
    {
        const Field   = this.Field;
        const Heights = Field.Heights;
        const Start   = Math.max(0, Math.min(FromIndex, this.Cache.length));

        if (Start === 0)
        {
            Heights.fill(0.0);
            Field.ClearDerivedChannels();
            Field.LayerCaves = [];
        }
        else if (this.Cache[Start - 1])
        {
            Heights.set(this.Cache[Start - 1]);
            Field.LayerCaves = [];
            for (let Prior = 0; Prior < Start; Prior++)
            {
                if (Layers[Prior] && Layers[Prior].Enabled && Layers[Prior].TypeId === "CaveNetwork")
                    BuildProceduralCaves(Field, Layers[Prior]);
            }
        }

        for (let Index = Start; Index < Layers.length; Index++)
        {
            const Layer = Layers[Index];
            const Type  = LayerTypeById(Layer.TypeId);
            const Overall = (Fraction) => Report(Type.Label, (Index + Fraction) / Math.max(Layers.length, 1));

            if (Layer.Enabled)
            {
                const Before = new Float32Array(Heights);
                if (Type.Build)
                {
                    const Generated = new Float32Array(Resolution * Resolution);
                    await Type.Build(Field, Layer, Generated, Overall, Cancel);
                    for (let Texel = 0; Texel < Heights.length; Texel++)
                    {
                        const Under = Heights[Texel];
                        const Over  = Generated[Texel];
                        switch (Layer.Blend)
                        {
                            case "Subtract": Heights[Texel] = Under - Over; break;
                            case "Replace":  Heights[Texel] = Over; break;
                            case "Maximum":  Heights[Texel] = Math.max(Under, Over); break;
                            case "Minimum":  Heights[Texel] = Math.min(Under, Over); break;
                            default:         Heights[Texel] = Under + Over; break;
                        }
                    }
                }
                else if (Type.Modify)
                {
                    await Type.Modify(Field, Layer, Overall, Cancel);
                }

                // Base-layer sculpting lives directly on Layer 0 so downstream erosion layers act over it.
                if (Index === 0 && Field.BaseDelta)
                {
                    const BaseDelta = Field.BaseDelta;
                    for (let Texel = 0; Texel < Heights.length; Texel++)
                        Heights[Texel] += BaseDelta[Texel];
                }

                if (!this.UnmaskedCache[Index])
                    this.UnmaskedCache[Index] = new Float32Array(Resolution * Resolution);
                this.UnmaskedCache[Index].set(Heights);

                // Uniform strength × mask mixing against the incoming relief.
                const Strength = Layer.Strength;
                if (Strength < 1.0 || Layer.MaskChannel)
                {
                    const Weights = Layer.MaskChannel ? this.BuildMaskWeights(Layer) : null;
                    for (let Texel = 0; Texel < Heights.length; Texel++)
                    {
                        const Mix = Strength * (Weights ? Weights[Texel] : 1.0);
                        if (Mix < 1.0)
                            Heights[Texel] = Before[Texel] + (Heights[Texel] - Before[Texel]) * Mix;
                    }
                }
            }

            if (!this.Cache[Index])
                this.Cache[Index] = new Float32Array(Resolution * Resolution);
            this.Cache[Index].set(Heights);
            Overall(1.0);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }

        // Slate pipeline post-erosion cliff & strata recut: re-sharpen strata ledges and blocky cliff
        // faces that were softened by hydraulic/thermal erosion.
        const LastErosionIdx = Layers.reduce((Acc, L, Idx) =>
            (L && L.Enabled && (L.TypeId === "FluvialIncision" || L.TypeId === "HydraulicErosion" || L.TypeId === "ThermalErosion")) ? Idx : Acc, -1);
        if (LastErosionIdx >= 0)
        {
            for (let Idx = 0; Idx < LastErosionIdx; Idx++)
            {
                const L = Layers[Idx];
                if (!L || !L.Enabled) continue;
                if (L.TypeId === "StrataTerrace")
                {
                    ApplyStrataPackages(Field, {
                        ...L.Params,
                        TerraceStrength: (L.Params.TerraceStrength || 0.75) * 0.52,
                        Seed: (L.Seed ^ 0x41B9),
                    }, Field.OutcropMask || null);
                }
                else if (L.TypeId === "RuggedPushPull")
                {
                    RuggedPushPull(Field, {
                        ...L.Params,
                        Amount: (L.Params.Amount || 14.0) * 0.45,
                        Seed: (L.Seed ^ 0x6C23),
                    });
                }
            }
        }

        const HasExplicitOutcrops = Layers.some((L) => L && L.Enabled && L.TypeId === "RockOutcrops");
        this.PostStackHeights  = new Float32Array(Heights);
        this.PostStackSnow     = new Float32Array(Field.ChannelSamples("Snow"));
        this.PostStackHardness = new Float32Array(Field.ChannelSamples("Hardness"));
        if (!HasExplicitOutcrops)
            this.ApplySceneOutcrops(Layers);

        Field.MeasureRange();
        Field.DeriveMoisture();
    }

    ApplySceneOutcrops(Layers)
    {
        const Field = this.Field;
        if (!this.PostStackHeights)
            return;
        Field.Heights.set(this.PostStackHeights);
        Field.ChannelSamples("Snow").set(this.PostStackSnow);
        Field.ChannelSamples("Hardness").set(this.PostStackHardness);

        const OutcropScale = (Field.OutcropScale !== undefined) ? Field.OutcropScale : 1.0;
        const RockScale    = (Field.RockScatterScale !== undefined) ? Field.RockScatterScale : 1.0;
        const QualityBoost = (Field.QualityDetailScale !== undefined) ? Field.QualityDetailScale : 1.0;
        const HasStacksOrTable = Layers && Layers.some((L) => L && L.Enabled && (L.TypeId === "RockStacks" || L.TypeId === "BoulderTors" || (L.TypeId === "SlateLandform" && (L.Params.PlateauStrength > 0.3 || L.Params.CliffHeight > 50))));
        const CragDamp = HasStacksOrTable ? 0.32 : 1.0;
        const Seed = (Layers && Layers[0]) ? (Layers[0].Seed ^ 0x5A17) : 7331;
        if (OutcropScale > 0.01 || RockScale > 0.01)
        {
            ApplyRuggedOutcropsAndRocks(Field,
            {
                OutcropAmplitude: 14.5 * CragDamp * OutcropScale * Math.pow(QualityBoost, 0.22),
                RockAmplitude:    4.8 * RockScale * Math.pow(QualityBoost, 0.30),
                Density:          Math.min(0.60 * Math.pow(QualityBoost, 0.18), 0.85),
                Seed:             Seed,
            });
        }
        Field.MeasureRange();
    }
}
