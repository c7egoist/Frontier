// 📦 Gradient, simplex and cellular noise plus Musgrave multifractal sums — the sampling kernel under every generator.

import { LatticeHash, CreateStream } from "./Random.js";

const SkewF2 = 0.5 * (Math.sqrt(3) - 1);
const SkewG2 = (3 - Math.sqrt(3)) / 6;
const GradientX = [1, -1, 1, -1, 1, -1, 0, 0];
const GradientY = [1, 1, -1, -1, 0, 0, 1, -1];

/// in    Seed     [-]  permutation seed
/// out   Table    [-]  512-entry permutation table, doubled to avoid wrap logic
export function CreatePermutation(Seed) {
    const Source = new Uint8Array(256);
    for (let I = 0; I < 256; I++) {
        Source[I] = I;
    }
    const Next = CreateStream(Seed ^ 0x5bd1e995);
    for (let I = 255; I > 0; I--) {
        const J = Math.floor(Next() * (I + 1));
        const Swap = Source[I];
        Source[I] = Source[J];
        Source[J] = Swap;
    }
    const Table = new Uint8Array(512);
    for (let I = 0; I < 512; I++) {
        Table[I] = Source[I & 255];
    }
    return Table;
}

/// in    T   [-]  fade parameter in [0, 1]
/// out   F   [-]  quintic smooth curve, zero first and second derivative at both ends
function Fade(T) {
    return T * T * T * (T * (T * 6 - 15) + 10);
}

/// in    Table   [-]  permutation table
/// in    X, Y    [-]  lattice-space coordinates
/// out   Noise   [-]  gradient noise, approximately in [-0.71, 0.71]
export function Perlin2(Table, X, Y) {
    const XI = Math.floor(X);
    const YI = Math.floor(Y);
    const XF = X - XI;
    const YF = Y - YI;
    const XW = XI & 255;
    const YW = YI & 255;
    const U = Fade(XF);
    const V = Fade(YF);
    const H00 = Table[Table[XW] + YW] & 7;
    const H10 = Table[Table[XW + 1] + YW] & 7;
    const H01 = Table[Table[XW] + YW + 1] & 7;
    const H11 = Table[Table[XW + 1] + YW + 1] & 7;
    const N00 = GradientX[H00] * XF + GradientY[H00] * YF;
    const N10 = GradientX[H10] * (XF - 1) + GradientY[H10] * YF;
    const N01 = GradientX[H01] * XF + GradientY[H01] * (YF - 1);
    const N11 = GradientX[H11] * (XF - 1) + GradientY[H11] * (YF - 1);
    const Low = N00 + U * (N10 - N00);
    const High = N01 + U * (N11 - N01);
    return Low + V * (High - Low);
}

/// in    Table   [-]  permutation table
/// in    X, Y    [-]  lattice-space coordinates
/// out   Noise   [-]  simplex noise, approximately in [-1, 1]
export function Simplex2(Table, X, Y) {
    const S = (X + Y) * SkewF2;
    const I = Math.floor(X + S);
    const J = Math.floor(Y + S);
    const T = (I + J) * SkewG2;
    const X0 = X - (I - T);
    const Y0 = Y - (J - T);
    const StepX = X0 > Y0 ? 1 : 0;
    const StepY = X0 > Y0 ? 0 : 1;
    const X1 = X0 - StepX + SkewG2;
    const Y1 = Y0 - StepY + SkewG2;
    const X2 = X0 - 1 + 2 * SkewG2;
    const Y2 = Y0 - 1 + 2 * SkewG2;
    const II = I & 255;
    const JJ = J & 255;
    let Total = 0;
    const Corners = [
        [0, X0, Y0, Table[II + Table[JJ]] & 7],
        [1, X1, Y1, Table[II + StepX + Table[JJ + StepY]] & 7],
        [2, X2, Y2, Table[II + 1 + Table[JJ + 1]] & 7],
    ];
    for (const [, CX, CY, Hash] of Corners) {
        const Falloff = 0.5 - CX * CX - CY * CY;
        if (Falloff > 0) {
            const F2 = Falloff * Falloff;
            Total += F2 * F2 * (GradientX[Hash] * CX + GradientY[Hash] * CY);
        }
    }
    return 70 * Total;
}

/// in    Seed    [-]  lattice seed for the jittered feature points
/// in    X, Y    [-]  lattice-space coordinates
/// out   F1      [-]  distance to the nearest feature point, cell units
/// out   F2      [-]  distance to the second-nearest feature point, cell units
export function Worley2(Seed, X, Y) {
    const XI = Math.floor(X);
    const YI = Math.floor(Y);
    let F1 = 1e9;
    let F2 = 1e9;
    for (let DY = -1; DY <= 1; DY++) {
        for (let DX = -1; DX <= 1; DX++) {
            const CX = XI + DX;
            const CY = YI + DY;
            const PX = CX + LatticeHash(Seed, CX, CY, 0);
            const PY = CY + LatticeHash(Seed, CX, CY, 1);
            const Distance = Math.hypot(PX - X, PY - Y);
            if (Distance < F1) {
                F2 = F1;
                F1 = Distance;
            } else if (Distance < F2) {
                F2 = Distance;
            }
        }
    }
    return { F1, F2 };
}

/// in    Sample   [-]  function (X, Y, Octave) returning a signed sample
/// in    X, Y     [-]  noise-space coordinates
/// in    Octaves  [-]  number of octaves, at least 1
/// in    Lacunarity [-] frequency multiplier per octave
/// in    Gain     [-]  amplitude multiplier per octave
/// out   Sum      [-]  amplitude-normalised fractal sum
export function FractalSum(Sample, X, Y, Octaves, Lacunarity, Gain) {
    let Amplitude = 1;
    let Frequency = 1;
    let Sum = 0;
    let Norm = 0;
    for (let Octave = 0; Octave < Octaves; Octave++) {
        Sum += Amplitude * Sample(X * Frequency, Y * Frequency, Octave);
        Norm += Amplitude;
        Amplitude *= Gain;
        Frequency *= Lacunarity;
    }
    return Norm > 0 ? Sum / Norm : 0;
}

/// in    Sample      [-]  function (X, Y, Octave) returning a signed sample
/// in    X, Y        [-]  noise-space coordinates
/// in    Octaves     [-]  number of octaves
/// in    Lacunarity  [-]  frequency multiplier per octave
/// in    Gain        [-]  spectral decay exponent H, expressed as amplitude gain
/// in    Offset      [-]  Musgrave offset that lifts the signal before it is weighted
/// out   Result      [-]  hybrid multifractal, unnormalised, roughly in [0, Octaves]
export function HybridMultifractal(Sample, X, Y, Octaves, Lacunarity, Gain, Offset) {
    const Exponent = Math.max(0.05, 1 - Gain);
    let Frequency = 1;
    let Spectral = 1;
    let Signal = (Sample(X, Y, 0) + Offset) * Spectral;
    let Result = Signal;
    let Weight = Signal;
    for (let Octave = 1; Octave < Octaves; Octave++) {
        Frequency *= Lacunarity;
        Spectral = Math.pow(Frequency, -Exponent);
        Weight = Math.min(Math.max(Weight, 0), 1);
        Signal = (Sample(X * Frequency, Y * Frequency, Octave) + Offset) * Spectral;
        Result += Weight * Signal;
        Weight *= Signal;
    }
    return Result;
}

/// in    Sample      [-]  function (X, Y, Octave) returning a signed sample
/// in    X, Y        [-]  noise-space coordinates
/// in    Octaves     [-]  number of octaves
/// in    Lacunarity  [-]  frequency multiplier per octave
/// in    Gain        [-]  amplitude multiplier per octave
/// in    Sharpness   [-]  exponent applied to each ridge; higher gives narrower crests
/// out   Result      [-]  ridged multifractal, roughly in [0, 1]
export function RidgedMultifractal(Sample, X, Y, Octaves, Lacunarity, Gain, Sharpness) {
    let Amplitude = 1;
    let Frequency = 1;
    let Weight = 1;
    let Sum = 0;
    let Norm = 0;
    for (let Octave = 0; Octave < Octaves; Octave++) {
        let Ridge = 1 - Math.abs(Sample(X * Frequency, Y * Frequency, Octave));
        Ridge = Math.pow(Math.max(Ridge, 0), Sharpness);
        Ridge *= Weight;
        Weight = Math.min(Math.max(Ridge * 1.6, 0), 1);
        Sum += Ridge * Amplitude;
        Norm += Amplitude;
        Amplitude *= Gain;
        Frequency *= Lacunarity;
    }
    return Norm > 0 ? Sum / Norm : 0;
}
