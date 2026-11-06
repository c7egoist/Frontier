#pragma once
/*==========================================================================================================================================
                                                           PLUMERECORDS.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of Shaders/PlumeRecords.wgsl: the smoke-and-fire cell lattices' step record, the source and
//    fire-light records, toroidal addressing, Gaussian source weight and blackbody flame colour.
//
//    Two cell lattices follow the vehicle, addressed toroidally exactly as the scene distance field's cascades are:
//    world cell c lives at texel c mod N, so the window moves by relabelling texels, never by copying them.
//
//    | Lattice  | Edge | Carries                                                                                   |
//    |----------|------|-------------------------------------------------------------------------------------------|
//    | velocity | 2h   | xyz velocity [m/s], w 1 where the scene distance field is solid                           |
//    | thermo   | h    | r rubber smoke [-], g temperature above ambient [K], b flame [-], a soot [-]               |
//    | light    | 2h   | r transmittance toward the sun, g toward the zenith, through the plume                    |
//
//    XY wrap; Z does not — the window's floor is fixed under the course and its height covers the plume.

#include "PlumeMath.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace FluidSmoke
{

struct Vec3i { int X = 0, Y = 0, Z = 0; };
struct Vec3u { uint32_t X = 0, Y = 0, Z = 0; };

// 📝 PlumeRecord: sixteen vec4 — the exact 256-byte layout EncodeRecord fills (PlumeSpace.js EncodeRecord).
struct PlumeRecord
{
    Vec3i VelocityOrigin      = { 0, 0, 0 };   // [cell] xyz world coarse cell of the window's minimum corner (z is 0), w step ordinal
    int   StepOrdinal         = 0;
    Vec3i PriorVelocityOrigin = { 0, 0, 0 };   // [cell] xyz the window the lattice state was written in, w source count
    int   SourceCount         = 0;
    Vec3u VelocityExtent      = { 0, 0, 0 };   // [cell] xyz coarse lattice extent, w unused
    uint32_t VelocityExtentW  = 0;
    Vec3u ThermoExtent        = { 0, 0, 0 };   // [cell] xyz fine lattice extent, w inspection (1 shows the cells)
    uint32_t Inspection       = 0;
    Vec3  LatticeA            = { 0, 0, 0 };   // x fine edge h [m], y coarse edge 2h [m], z floor height [m]
    float StepSeconds         = 0.0f;         // w step duration [s]
    Vec3  ForceXyz            = { 0, 0, 0 };   // x buoyancy [m/s²/K], y smoke weight [m/s²], z vorticity confinement [-]
    float Turbulence          = 0.0f;         // w curl turbulence [m/s]
    Vec3  RetentionXyz        = { 0, 0, 0 };   // [-] x smoke, y heat, z flame — multipliers over this step
    float VelocityRetention   = 0.0f;         // w velocity
    Vec3  Wind                = { 0, 0, 0 };   // xyz ambient flow [m/s]
    float ElapsedSeconds      = 0.0f;         // w elapsed seconds [s]
    Vec3  SourceMinimum       = { 0, 0, 0 };   // xyz bounds of every source [m]
    float FrameSeconds        = 0.0f;         // w frame duration for moving-solid velocity [s]
    Vec3  SourceMaximum       = { 0, 0, 0 };   // xyz [m]
    float FlameScale          = 0.0f;         // w flame emission scale [-]
    float SmokeExtinction     = 0.0f;         // x smoke extinction per density [1/m]
    float SmokeAlbedo         = 0.0f;         // y smoke albedo [-]
    float SootExtinction      = 0.0f;         // z soot extinction per density [1/m]
    float MarchSamples        = 0.0f;         // w march samples
    Vec3  Sun                 = { 0, 0, 1 };   // xyz unit direction toward the sun
    float SootAlbedo          = 0.0f;         // w soot albedo [-]
    float SootShed            = 0.0f;         // x soot shed per flame per second [1/s]
    float HeatRelease         = 0.0f;         // y heat released per flame per second [K/s]
    float SootRetention       = 0.0f;         // z soot retention [-]
    float CombustionW         = 0.0f;         // w unused
    float Scattering          = 0.0f;         // x multiple-scattering strength [-]
    float Anisotropy          = 0.0f;         // y phase anisotropy g [-]
    float AmbientScale        = 0.0f;         // z ambient scale [-]
    float FireLightScale      = 0.0f;         // w fire-light scale [-]
    float Detail              = 0.0f;         // x sub-cell detail strength [-]
    float DetailScale         = 0.0f;         // y detail frequency [1/m]
    float TurbulenceScale     = 0.0f;         // z turbulence frequency [1/m]
    float DetailW             = 0.0f;         // w unused
    float FlameCore           = 0.0f;         // x core temperature [K]
    float FlameTip            = 0.0f;         // y tip temperature [K]
    float FlameHeatThreshold  = 0.0f;         // z heat at which a cell reaches the core [K]
    float FlameW              = 0.0f;         // w unused
};

static_assert(sizeof(PlumeRecord) == 256, "PlumeRecord must stay the 256-byte PlumeRecords.wgsl layout");

// 📝 PlumeSource: position·radius, velocity·spare, rates (smoke, heat, flame, soot) — 12 floats (SourceStride).
struct PlumeSource
{
    Vec3  Position = { 0, 0, 0 };
    float Radius   = 0.0f;
    Vec3  Velocity = { 0, 0, 0 };
    float Spare    = 0.0f;
    float SmokeRate = 0.0f, HeatRate = 0.0f, FlameRate = 0.0f, SootRate = 0.0f;
};

// 📝 FireLightRecord: count + four position·radius + four radiance (144 bytes).
struct FireLightRecord
{
    uint32_t Count = 0;
    std::array<Vec3, 4>  Position{};
    std::array<float, 4> Radius{};
    std::array<Vec3, 4>  Radiance{};
};

constexpr float PlumeSpeedCeiling = 40.0f;   // [m/s] - no cell is allowed to outrun this, whatever the sources say

//------------------------------------------------------------------------------------------------------------------------
//                                                 TOROIDAL ADDRESSING
//------------------------------------------------------------------------------------------------------------------------

// 📝 WrapLattice: XY wrap; Z does not.
inline Vec3i WrapLattice(Vec3i Cell, Vec3u Extent)
{
    const int Ex = static_cast<int>(Extent.X), Ey = static_cast<int>(Extent.Y);
    auto Wrap = [](int V, int E) { return ((V % E) + E) % E; };
    return { Wrap(Cell.X, Ex), Wrap(Cell.Y, Ey), Cell.Z };
}

// 📝 Texel of a local velocity cell (0 … extent − 1 inside the current window); local may step one cell outside.
inline Vec3i ResolveVelocityTexel(const PlumeRecord& Plume, Vec3i Local)
{
    return WrapLattice({ Plume.VelocityOrigin.X + Local.X, Plume.VelocityOrigin.Y + Local.Y, Local.Z }, Plume.VelocityExtent);
}

inline Vec3i ResolveThermoTexel(const PlumeRecord& Plume, Vec3i Local)
{
    return WrapLattice({ 2 * Plume.VelocityOrigin.X + Local.X, 2 * Plume.VelocityOrigin.Y + Local.Y, Local.Z }, Plume.ThermoExtent);
}

inline Vec3 ProjectVelocityWorld(const PlumeRecord& Plume, Vec3u Local)
{
    return { (static_cast<float>(Plume.VelocityOrigin.X + static_cast<int>(Local.X)) + 0.5f) * Plume.LatticeA[1],
             (static_cast<float>(Plume.VelocityOrigin.Y + static_cast<int>(Local.Y)) + 0.5f) * Plume.LatticeA[1],
             Plume.LatticeA[2] + (static_cast<float>(Local.Z) + 0.5f) * Plume.LatticeA[1] };
}

inline Vec3 ProjectThermoWorld(const PlumeRecord& Plume, Vec3u Local)
{
    return { (static_cast<float>(2 * Plume.VelocityOrigin.X + static_cast<int>(Local.X)) + 0.5f) * Plume.LatticeA[0],
             (static_cast<float>(2 * Plume.VelocityOrigin.Y + static_cast<int>(Local.Y)) + 0.5f) * Plume.LatticeA[0],
             Plume.LatticeA[2] + (static_cast<float>(Local.Z) + 0.5f) * Plume.LatticeA[0] };
}

// 📝 Sampling coordinates: the repeat address mode on U and V performs the wrap; W is clamped.
inline Vec3 ProjectVelocityCoordinates(const PlumeRecord& Plume, const Vec3& Position)
{
    const float SpanX = static_cast<float>(Plume.VelocityExtent.X) * Plume.LatticeA[1];
    const float SpanY = static_cast<float>(Plume.VelocityExtent.Y) * Plume.LatticeA[1];
    const float SpanZ = static_cast<float>(Plume.VelocityExtent.Z) * Plume.LatticeA[1];
    return { Position[0] / SpanX, Position[1] / SpanY, (Position[2] - Plume.LatticeA[2]) / SpanZ };
}

inline Vec3 ProjectThermoCoordinates(const PlumeRecord& Plume, const Vec3& Position)
{
    const float SpanX = static_cast<float>(Plume.ThermoExtent.X) * Plume.LatticeA[0];
    const float SpanY = static_cast<float>(Plume.ThermoExtent.Y) * Plume.LatticeA[0];
    const float SpanZ = static_cast<float>(Plume.ThermoExtent.Z) * Plume.LatticeA[0];
    return { Position[0] / SpanX, Position[1] / SpanY, (Position[2] - Plume.LatticeA[2]) / SpanZ };
}

// 📝 A position lies in a window's interior when every trilinear tap it takes is a texel of that window — half a cell
//    in from each wrapped face, so a sample beside one edge can never read the opposite edge through the wrap.
inline bool ClassifyWindowInterior(const Vec3& Position, const Vec3i& Origin, const Vec3u& Extent, float Edge, float Floor)
{
    const float Lx = Position[0] / Edge - static_cast<float>(Origin.X);
    const float Ly = Position[1] / Edge - static_cast<float>(Origin.Y);
    const float Lz = (Position[2] - Floor) / Edge;
    return Lx >= 0.5f && Ly >= 0.5f && Lz >= 0.5f
        && Lx <= static_cast<float>(Extent.X) - 0.5f && Ly <= static_cast<float>(Extent.Y) - 0.5f && Lz <= static_cast<float>(Extent.Z) - 0.5f;
}

inline bool ClassifyPriorVelocity(const PlumeRecord& Plume, const Vec3& Position)
{
    return ClassifyWindowInterior(Position, Plume.PriorVelocityOrigin, Plume.VelocityExtent, Plume.LatticeA[1], Plume.LatticeA[2]);
}

inline bool ClassifyPriorThermo(const PlumeRecord& Plume, const Vec3& Position)
{
    return ClassifyWindowInterior(Position, { 2 * Plume.PriorVelocityOrigin.X, 2 * Plume.PriorVelocityOrigin.Y, 0 },
                                  Plume.ThermoExtent, Plume.LatticeA[0], Plume.LatticeA[2]);
}

inline bool ClassifySourceBounds(const PlumeRecord& Plume, const Vec3& Position)
{
    return Plume.SourceCount > 0 && Position[0] >= Plume.SourceMinimum[0] && Position[1] >= Plume.SourceMinimum[1]
        && Position[2] >= Plume.SourceMinimum[2] && Position[0] <= Plume.SourceMaximum[0] && Position[1] <= Plume.SourceMaximum[1]
        && Position[2] <= Plume.SourceMaximum[2];
}

// 📐 Gaussian source weight exp(−1.7·d²/r²), r floored at three quarters of a cell so a source narrower than the
//    lattice still deposits; zero beyond 3.5 radii (Frontier's SmokeTransport.slang injection). The centre is lifted
//    0.55 of a cell, as Frontier's is: a contact patch lies on the supporting plane, and a Gaussian centred there
//    would spend half its weight in cells the plane makes solid.
inline float ResolveSourceWeight(const PlumeSource& Source, const Vec3& Position, float Edge)
{
    const float Radius = std::max(Source.Radius, 0.75f * Edge);
    const Vec3 Offset = { (Position[0] - Source.Position[0]) / Radius,
                          (Position[1] - Source.Position[1]) / Radius,
                          (Position[2] - Source.Position[2] - 0.55f * Edge) / Radius };
    const float Squared = Dot(Offset, Offset);
    return Squared > 12.25f ? 0.0f : std::exp(-1.7f * Squared);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   FLAME COLOUR
//------------------------------------------------------------------------------------------------------------------------

// 📐 The colour of a blackbody at Temperature [K], linear Rec.709, normalised to unit maximum channel: Helland's fit
//    of the Planckian locus (sRGB-encoded) decoded to linear. Valid 1000–6600 K.
inline Vec3 ResolveBlackbodyColour(float Temperature)
{
    const float Hecto = std::clamp(Temperature, 1000.0f, 6600.0f) / 100.0f;
    const float Green = std::clamp((99.4708025861f * std::log(Hecto) - 161.1195681661f) / 255.0f, 0.0f, 1.0f);
    const float Blue = Hecto <= 19.0f ? 0.0f
        : std::clamp((138.5177312231f * std::log(std::max(Hecto - 10.0f, 1.0f)) - 305.0447927307f) / 255.0f, 0.0f, 1.0f);
    const float G = 2.2f;
    return { std::pow(1.0f, G), std::pow(Green, G), std::pow(Blue, G) };
}

// 📐 Stefan–Boltzmann in relative form: radiance rises with the fourth power of temperature, referred to 1500 K.
inline Vec3 ResolveBlackbodyRadiance(float Temperature)
{
    const float Ratio = Temperature / 1500.0f;
    const Vec3 Colour = ResolveBlackbodyColour(Temperature);
    const float Fourth = Ratio * Ratio * Ratio * Ratio;
    return ScaleVector(Colour, Fourth);
}

} // namespace FluidSmoke
