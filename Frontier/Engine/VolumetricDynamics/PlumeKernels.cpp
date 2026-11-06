/*==========================================================================================================================================
                                                            PLUMEKERNELS.CPP
==========================================================================================================================================*/
// 🧩 CPU execution of PlumeAdvection.wgsl, PlumeVorticity.wgsl, PlumePressure.wgsl and PlumeMarch.wgsl.
//    Entry points, constants and arithmetic match the WGSL; GPU textures become PlumeLattice.

#include "Frontier/Engine/VolumetricDynamics/GasParameters.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeSpace.h"

#include <algorithm>
#include <cmath>

namespace Frontier
{

namespace
{

constexpr float VelocitySolidReach = 0.0f;
constexpr float ThermoSolidReach = -0.25f;
constexpr float SubgridHeatRise = 1.4f;
constexpr float SubgridFlameRise = 1.1f;
constexpr float InversePi = 0.318309886f;

int WrapIndex(int Cell, int Extent)
{
    return PlumeWrap(Cell, Extent);
}

PlumeVec4 LoadTexel(const PlumeLattice& Lattice, int X, int Y, int Z)
{
    X = WrapIndex(X, Lattice.Width);
    Y = WrapIndex(Y, Lattice.Height);
    Z = std::clamp(Z, 0, Lattice.Depth - 1);
    return Lattice.At(X, Y, Z);
}

void StoreTexel(PlumeLattice& Lattice, int X, int Y, int Z, PlumeVec4 Value)
{
    if (X < 0 || Y < 0 || Z < 0 || X >= Lattice.Width || Y >= Lattice.Height || Z >= Lattice.Depth)
        return;
    Lattice.At(X, Y, Z) = Value;
}

PlumeVec4 SampleRepeatClamp(const PlumeLattice& Lattice, PlumeVec3 Uv)
{
    float U = Uv.X - std::floor(Uv.X);
    float V = Uv.Y - std::floor(Uv.Y);
    float W = std::clamp(Uv.Z, 0.0f, 1.0f);
    const float Fx = U * static_cast<float>(Lattice.Width) - 0.5f;
    const float Fy = V * static_cast<float>(Lattice.Height) - 0.5f;
    const float Fz = W * static_cast<float>(Lattice.Depth) - 0.5f;
    const int X0 = static_cast<int>(std::floor(Fx));
    const int Y0 = static_cast<int>(std::floor(Fy));
    const int Z0 = static_cast<int>(std::floor(Fz));
    const float Tx = Fx - static_cast<float>(X0);
    const float Ty = Fy - static_cast<float>(Y0);
    const float Tz = Fz - static_cast<float>(Z0);
    PlumeVec4 Acc{};
    for (int Dz = 0; Dz <= 1; ++Dz)
        for (int Dy = 0; Dy <= 1; ++Dy)
            for (int Dx = 0; Dx <= 1; ++Dx)
            {
                const float Wx = Dx ? Tx : 1.0f - Tx;
                const float Wy = Dy ? Ty : 1.0f - Ty;
                const float Wz = Dz ? Tz : 1.0f - Tz;
                const PlumeVec4 Sample = LoadTexel(Lattice, X0 + Dx, Y0 + Dy, Z0 + Dz);
                Acc = Acc + Sample * (Wx * Wy * Wz);
            }
    return Acc;
}

int LocalIndex(const PlumeRecord& Plume, int X, int Y, int Z)
{
    const int Ex = static_cast<int>(Plume.VelocityExtent[0]);
    const int Ey = static_cast<int>(Plume.VelocityExtent[1]);
    const int Ez = static_cast<int>(Plume.VelocityExtent[2]);
    X = std::clamp(X, 0, Ex - 1);
    Y = std::clamp(Y, 0, Ey - 1);
    Z = std::clamp(Z, 0, Ez - 1);
    return (Z * Ey + Y) * Ex + X;
}

int PressureIndex(const PlumeRecord& Plume, int LX, int LY, int LZ)
{
    const auto Texel = ResolveVelocityTexel(Plume, LX, LY, LZ);
    const int Ex = static_cast<int>(Plume.VelocityExtent[0]);
    const int Ey = static_cast<int>(Plume.VelocityExtent[1]);
    return (Texel[2] * Ey + Texel[1]) * Ex + Texel[0];
}

PlumeVec4 LoadVelocityLocal(const PlumeSpace& Space, const PlumeLattice& Lattice, int LX, int LY, int LZ)
{
    const int Ex = Space.VelocityExtent[0] - 1;
    const int Ey = Space.VelocityExtent[1] - 1;
    const int Ez = Space.VelocityExtent[2] - 1;
    LX = std::clamp(LX, 0, Ex);
    LY = std::clamp(LY, 0, Ey);
    LZ = std::clamp(LZ, 0, Ez);
    const auto Texel = ResolveVelocityTexel(Space.Record, LX, LY, LZ);
    return LoadTexel(Lattice, Texel[0], Texel[1], Texel[2]);
}

bool ClassifyInside(const PlumeSpace& Space, int LX, int LY, int LZ)
{
    return LX >= 0 && LY >= 0 && LZ >= 0
        && LX < Space.VelocityExtent[0] && LY < Space.VelocityExtent[1] && LZ < Space.VelocityExtent[2];
}

float NeighbourPressure(const PlumeSpace& Space, const PlumeLattice& VelocityState, const std::vector<float>& PressureSource,
                        int LX, int LY, int LZ, float Centre)
{
    if (LZ < 0) return Centre;
    if (!ClassifyInside(Space, LX, LY, LZ)) return 0.0f;
    if (LoadVelocityLocal(Space, VelocityState, LX, LY, LZ).W > 0.5f) return Centre;
    return PressureSource[static_cast<size_t>(PressureIndex(Space.Record, LX, LY, LZ))];
}

PlumeVec3 SampleLatticeVelocity(const PlumeSpace& Space, const PlumeLattice& VelocityState, PlumeVec3 Position, float Activity)
{
    const PlumeVec4 Sampled = SampleRepeatClamp(VelocityState, ProjectVelocityCoordinates(Space.Record, Position));
    PlumeVec3 Velocity = { Sampled.X, Sampled.Y, Sampled.Z };
    const float Time = Space.Record.Wind[3];
    const float Frequency = Space.Record.Detail[2];
    const PlumeVec3 First = Position * Frequency + PlumeVec3{ 0.43f, -0.31f, 0.27f } * Time;
    const PlumeVec3 Second = Position * (Frequency * 2.37f) + PlumeVec3{ -0.61f, 0.53f, -0.89f } * Time + PlumeVec3{ 1.7f, 4.1f, 2.9f };
    const PlumeVec3 Swirl = PlumeVec3{ std::sin(First.Y) - std::sin(First.Z), std::sin(First.Z) - std::sin(First.X), std::sin(First.X) - std::sin(First.Y) }
        + PlumeVec3{ std::sin(Second.Y) - std::sin(Second.Z), std::sin(Second.Z) - std::sin(Second.X), std::sin(Second.X) - std::sin(Second.Y) } * 0.45f;
    return Velocity + Swirl * (Space.Record.Forces[3] * (0.3f + 0.7f * Activity));
}

void AdvectVelocity(PlumeSpace& Space, const SceneDistanceField& Distance)
{
    const PlumeRecord& Plume = Space.Record;
    const PlumeLattice& VelocityState = Space.Velocity[Space.State];
    const PlumeLattice& ThermoState = Space.Thermo[Space.State];
    PlumeLattice& Target = Space.Velocity[1 - Space.State];
    const float Edge = Plume.Lattice[1];
    const float Seconds = Plume.Lattice[3];
    const PlumeVec3 Wind = { Plume.Wind[0], Plume.Wind[1], Plume.Wind[2] };
    for (int Z = 0; Z < Space.VelocityExtent[2]; ++Z)
        for (int Y = 0; Y < Space.VelocityExtent[1]; ++Y)
            for (int X = 0; X < Space.VelocityExtent[0]; ++X)
            {
                const PlumeVec3 Position = ProjectVelocityWorld(Plume, static_cast<unsigned>(X), static_cast<unsigned>(Y), static_cast<unsigned>(Z));
                const auto Texel = ResolveVelocityTexel(Plume, X, Y, Z);
                const PlumeVec4 Solid = Distance.ResolveSolid(Position, Edge, Plume.SourceMinimum[3]);
                if (Solid.W > 0.5f)
                {
                    StoreTexel(Target, Texel[0], Texel[1], Texel[2], Solid);
                    continue;
                }
                PlumeVec3 Velocity = Wind;
                if (ClassifyPriorVelocity(Plume, Position))
                {
                    const PlumeVec4 Own = SampleRepeatClamp(VelocityState, ProjectVelocityCoordinates(Plume, Position));
                    const PlumeVec3 Departure = Position - PlumeVec3{ Own.X, Own.Y, Own.Z } * Seconds;
                    if (ClassifyPriorVelocity(Plume, Departure))
                    {
                        const PlumeVec4 Sampled = SampleRepeatClamp(VelocityState, ProjectVelocityCoordinates(Plume, Departure));
                        Velocity = { Sampled.X, Sampled.Y, Sampled.Z };
                    }
                }
                Velocity = Wind + (Velocity - Wind) * Plume.Retention[3];
                if (ClassifyPriorThermo(Plume, Position))
                {
                    const PlumeVec4 Thermo = SampleRepeatClamp(ThermoState, ProjectThermoCoordinates(Plume, Position));
                    const float Lift = Plume.Forces[0] * Thermo.Y / (1.0f + 0.125f * Thermo.Y);
                    Velocity.Z += (Lift - Plume.Forces[1] * (Thermo.X + Thermo.W)) * Seconds;
                }
                if (ClassifySourceBounds(Plume, Position))
                {
                    for (int Index = 0; Index < static_cast<int>(Plume.PriorVelocityOrigin[3]) && Index < static_cast<int>(Space.PackedSources.size()); ++Index)
                    {
                        const PlumeSource& Source = Space.PackedSources[static_cast<size_t>(Index)];
                        const float Weight = ResolveSourceWeight(Source, Position, Edge);
                        const float Push = 1.0f - std::exp(-Weight * Seconds * (4.0f + 0.15f * (Source.Rates.X + Source.Rates.W) + 0.05f * Source.Rates.Z));
                        Velocity = PlumeMix(Velocity, PlumeVec3{ Source.Velocity.X, Source.Velocity.Y, Source.Velocity.Z }, Push);
                    }
                }
                const float Speed = PlumeLength(Velocity);
                if (Speed > PlumeSpeedCeiling)
                    Velocity = Velocity * (PlumeSpeedCeiling / Speed);
                StoreTexel(Target, Texel[0], Texel[1], Texel[2], { Velocity.X, Velocity.Y, Velocity.Z, 0.0f });
            }
}

void AdvectThermo(PlumeSpace& Space, const SceneDistanceField& Distance)
{
    const PlumeRecord& Plume = Space.Record;
    const PlumeLattice& VelocityState = Space.Velocity[1 - Space.State];
    const PlumeLattice& ThermoState = Space.Thermo[Space.State];
    PlumeLattice& Target = Space.Thermo[1 - Space.State];
    const float Edge = Plume.Lattice[0];
    const float Seconds = Plume.Lattice[3];
    Space.Coverage.Low[0] = Space.Coverage.Low[1] = Space.Coverage.Low[2] = 0x7FFFFFFF;
    Space.Coverage.High[0] = Space.Coverage.High[1] = Space.Coverage.High[2] = -0x7FFFFFFF;
    for (int Z = 0; Z < Space.ThermoExtent[2]; ++Z)
        for (int Y = 0; Y < Space.ThermoExtent[1]; ++Y)
            for (int X = 0; X < Space.ThermoExtent[0]; ++X)
            {
                const PlumeVec3 Position = ProjectThermoWorld(Plume, static_cast<unsigned>(X), static_cast<unsigned>(Y), static_cast<unsigned>(Z));
                PlumeVec4 Thermo{};
                if (Distance.Sample(Position)[0] >= ThermoSolidReach * Edge)
                {
                    float Activity = 0.0f;
                    float RiseHeat = 0.0f, RiseFlame = 0.0f;
                    if (ClassifyPriorThermo(Plume, Position))
                    {
                        const PlumeVec4 Here = SampleRepeatClamp(ThermoState, ProjectThermoCoordinates(Plume, Position));
                        Activity = std::clamp(0.6f * (Here.X + Here.W) + 0.02f * Here.Y + Here.Z, 0.0f, 1.0f);
                        RiseHeat = std::clamp(Here.Y / 40.0f, 0.0f, 1.0f);
                        RiseFlame = std::clamp(Here.Z, 0.0f, 1.0f);
                    }
                    const PlumeVec3 Slip = { 0.0f, 0.0f, SubgridHeatRise * RiseHeat + SubgridFlameRise * RiseFlame };
                    const PlumeVec3 Midpoint = Position - (SampleLatticeVelocity(Space, VelocityState, Position, Activity) + Slip) * (0.5f * Seconds);
                    const PlumeVec3 Departure = Position - (SampleLatticeVelocity(Space, VelocityState, Midpoint, Activity) + Slip) * Seconds;
                    if (ClassifyPriorThermo(Plume, Departure))
                        Thermo = SampleRepeatClamp(ThermoState, ProjectThermoCoordinates(Plume, Departure));
                    const float Burning = std::max(Thermo.Z, 0.0f) * Seconds;
                    Thermo.Y += Burning * Plume.Combustion[1];
                    Thermo.W += Burning * Plume.Combustion[0];
                    Thermo = { Thermo.X * Plume.Retention[0], Thermo.Y * Plume.Retention[1], Thermo.Z * Plume.Retention[2], Thermo.W * Plume.Combustion[2] };
                    if (ClassifySourceBounds(Plume, Position))
                    {
                        for (int Index = 0; Index < static_cast<int>(Plume.PriorVelocityOrigin[3]) && Index < static_cast<int>(Space.PackedSources.size()); ++Index)
                        {
                            const PlumeSource& Source = Space.PackedSources[static_cast<size_t>(Index)];
                            Thermo = Thermo + Source.Rates * (ResolveSourceWeight(Source, Position, Edge) * Seconds);
                        }
                    }
                    Thermo = PlumeClampVec(Thermo, { 0, 0, 0, 0 }, { 64.0f, 4096.0f, 16.0f, 64.0f });
                }
                const auto Texel = ResolveThermoTexel(Plume, X, Y, Z);
                StoreTexel(Target, Texel[0], Texel[1], Texel[2], Thermo);
                if (Thermo.X > 0.002f || Thermo.W > 0.002f || Thermo.Z > 0.01f)
                {
                    Space.Coverage.Low[0] = std::min(Space.Coverage.Low[0], X);
                    Space.Coverage.Low[1] = std::min(Space.Coverage.Low[1], Y);
                    Space.Coverage.Low[2] = std::min(Space.Coverage.Low[2], Z);
                    Space.Coverage.High[0] = std::max(Space.Coverage.High[0], X);
                    Space.Coverage.High[1] = std::max(Space.Coverage.High[1], Y);
                    Space.Coverage.High[2] = std::max(Space.Coverage.High[2], Z);
                }
            }
}

void ResolveCurl(PlumeSpace& Space)
{
    const PlumeLattice& VelocityState = Space.Velocity[1 - Space.State];
    const float Scale = 0.5f / Space.Record.Lattice[1];
    for (int Z = 0; Z < Space.VelocityExtent[2]; ++Z)
        for (int Y = 0; Y < Space.VelocityExtent[1]; ++Y)
            for (int X = 0; X < Space.VelocityExtent[0]; ++X)
            {
                const PlumeVec4 Xp = LoadVelocityLocal(Space, VelocityState, X + 1, Y, Z);
                const PlumeVec4 Xm = LoadVelocityLocal(Space, VelocityState, X - 1, Y, Z);
                const PlumeVec4 Yp = LoadVelocityLocal(Space, VelocityState, X, Y + 1, Z);
                const PlumeVec4 Ym = LoadVelocityLocal(Space, VelocityState, X, Y - 1, Z);
                const PlumeVec4 Zp = LoadVelocityLocal(Space, VelocityState, X, Y, Z + 1);
                const PlumeVec4 Zm = LoadVelocityLocal(Space, VelocityState, X, Y, Z - 1);
                const PlumeVec3 Omega = { ((Yp.Z - Ym.Z) - (Zp.Y - Zm.Y)) * Scale,
                                          ((Zp.X - Zm.X) - (Xp.Z - Xm.Z)) * Scale,
                                          ((Xp.Y - Xm.Y) - (Yp.X - Ym.X)) * Scale };
                Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X, Y, Z))] = { Omega.X, Omega.Y, Omega.Z, PlumeLength(Omega) };
            }
}

void ConfineVorticity(PlumeSpace& Space)
{
    const PlumeLattice& VelocityState = Space.Velocity[1 - Space.State];
    PlumeLattice& Target = Space.Velocity[Space.State];
    const float Scale = 0.5f / Space.Record.Lattice[1];
    for (int Z = 0; Z < Space.VelocityExtent[2]; ++Z)
        for (int Y = 0; Y < Space.VelocityExtent[1]; ++Y)
            for (int X = 0; X < Space.VelocityExtent[0]; ++X)
            {
                const PlumeVec4 Own = LoadVelocityLocal(Space, VelocityState, X, Y, Z);
                PlumeVec3 Velocity = { Own.X, Own.Y, Own.Z };
                if (Own.W < 0.5f && Space.Record.Forces[2] > 0.0f)
                {
                    const float EtaX = Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X + 1, Y, Z))].W
                                     - Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X - 1, Y, Z))].W;
                    const float EtaY = Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X, Y + 1, Z))].W
                                     - Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X, Y - 1, Z))].W;
                    const float EtaZ = Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X, Y, Z + 1))].W
                                     - Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X, Y, Z - 1))].W;
                    const PlumeVec3 Eta = { EtaX * Scale, EtaY * Scale, EtaZ * Scale };
                    const float Length = PlumeLength(Eta);
                    if (Length > 1.0e-5f)
                    {
                        const PlumeVec4 Curl = Space.Curl[static_cast<size_t>(LocalIndex(Space.Record, X, Y, Z))];
                        const PlumeVec3 Omega = { Curl.X, Curl.Y, Curl.Z };
                        Velocity = Velocity + PlumeCross(Eta * (1.0f / Length), Omega)
                                 * (Space.Record.Forces[2] * Space.Record.Lattice[1] * Space.Record.Lattice[3]);
                    }
                }
                const auto Texel = ResolveVelocityTexel(Space.Record, X, Y, Z);
                StoreTexel(Target, Texel[0], Texel[1], Texel[2], { Velocity.X, Velocity.Y, Velocity.Z, Own.W });
            }
}

void ResolveDivergence(PlumeSpace& Space)
{
    const PlumeLattice& VelocityState = Space.Velocity[Space.State];
    const float Scale = 0.5f / Space.Record.Lattice[1];
    for (int Z = 0; Z < Space.VelocityExtent[2]; ++Z)
        for (int Y = 0; Y < Space.VelocityExtent[1]; ++Y)
            for (int X = 0; X < Space.VelocityExtent[0]; ++X)
            {
                const PlumeVec4 Own = LoadVelocityLocal(Space, VelocityState, X, Y, Z);
                const float Flux = (LoadVelocityLocal(Space, VelocityState, X + 1, Y, Z).X - LoadVelocityLocal(Space, VelocityState, X - 1, Y, Z).X)
                                 + (LoadVelocityLocal(Space, VelocityState, X, Y + 1, Z).Y - LoadVelocityLocal(Space, VelocityState, X, Y - 1, Z).Y)
                                 + (LoadVelocityLocal(Space, VelocityState, X, Y, Z + 1).Z - LoadVelocityLocal(Space, VelocityState, X, Y, Z - 1).Z);
                Space.Divergence[static_cast<size_t>(LocalIndex(Space.Record, X, Y, Z))] = Own.W > 0.5f ? 0.0f : Flux * Scale;
                const PlumeVec3 Position = ProjectVelocityWorld(Space.Record, static_cast<unsigned>(X), static_cast<unsigned>(Y), static_cast<unsigned>(Z));
                if (!ClassifyPriorVelocity(Space.Record, Position))
                {
                    const int Index = PressureIndex(Space.Record, X, Y, Z);
                    Space.Pressure[0][static_cast<size_t>(Index)] = 0.0f;
                    Space.Pressure[1][static_cast<size_t>(Index)] = 0.0f;
                }
            }
}

void RelaxPressure(PlumeSpace& Space, int SourceSlot)
{
    const PlumeLattice& VelocityState = Space.Velocity[Space.State];
    const std::vector<float>& Source = Space.Pressure[SourceSlot];
    std::vector<float>& Target = Space.Pressure[1 - SourceSlot];
    const float Edge = Space.Record.Lattice[1];
    for (int Z = 0; Z < Space.VelocityExtent[2]; ++Z)
        for (int Y = 0; Y < Space.VelocityExtent[1]; ++Y)
            for (int X = 0; X < Space.VelocityExtent[0]; ++X)
            {
                const int Index = PressureIndex(Space.Record, X, Y, Z);
                const float Centre = Source[static_cast<size_t>(Index)];
                if (LoadVelocityLocal(Space, VelocityState, X, Y, Z).W > 0.5f)
                {
                    Target[static_cast<size_t>(Index)] = Centre;
                    continue;
                }
                const float Sum = NeighbourPressure(Space, VelocityState, Source, X + 1, Y, Z, Centre)
                                + NeighbourPressure(Space, VelocityState, Source, X - 1, Y, Z, Centre)
                                + NeighbourPressure(Space, VelocityState, Source, X, Y + 1, Z, Centre)
                                + NeighbourPressure(Space, VelocityState, Source, X, Y - 1, Z, Centre)
                                + NeighbourPressure(Space, VelocityState, Source, X, Y, Z + 1, Centre)
                                + NeighbourPressure(Space, VelocityState, Source, X, Y, Z - 1, Centre);
                Target[static_cast<size_t>(Index)] = (Sum - Space.Divergence[static_cast<size_t>(LocalIndex(Space.Record, X, Y, Z))] * Edge * Edge) / 6.0f;
            }
}

void ProjectVelocity(PlumeSpace& Space)
{
    const PlumeLattice& VelocityState = Space.Velocity[Space.State];
    PlumeLattice& Target = Space.Velocity[1 - Space.State];
    const std::vector<float>& Source = Space.Pressure[0];
    const float Scale = 0.5f / Space.Record.Lattice[1];
    for (int Z = 0; Z < Space.VelocityExtent[2]; ++Z)
        for (int Y = 0; Y < Space.VelocityExtent[1]; ++Y)
            for (int X = 0; X < Space.VelocityExtent[0]; ++X)
            {
                const PlumeVec4 Own = LoadVelocityLocal(Space, VelocityState, X, Y, Z);
                const auto Texel = ResolveVelocityTexel(Space.Record, X, Y, Z);
                if (Own.W > 0.5f)
                {
                    StoreTexel(Target, Texel[0], Texel[1], Texel[2], Own);
                    continue;
                }
                const float Centre = Source[static_cast<size_t>(PressureIndex(Space.Record, X, Y, Z))];
                const PlumeVec3 Gradient = {
                    (NeighbourPressure(Space, VelocityState, Source, X + 1, Y, Z, Centre) - NeighbourPressure(Space, VelocityState, Source, X - 1, Y, Z, Centre)) * Scale,
                    (NeighbourPressure(Space, VelocityState, Source, X, Y + 1, Z, Centre) - NeighbourPressure(Space, VelocityState, Source, X, Y - 1, Z, Centre)) * Scale,
                    (NeighbourPressure(Space, VelocityState, Source, X, Y, Z + 1, Centre) - NeighbourPressure(Space, VelocityState, Source, X, Y, Z - 1, Centre)) * Scale
                };
                PlumeVec3 Velocity = PlumeVec3{ Own.X, Own.Y, Own.Z } - Gradient;
                const float Speed = PlumeLength(Velocity);
                if (Speed > PlumeSpeedCeiling)
                    Velocity = Velocity * (PlumeSpeedCeiling / Speed);
                StoreTexel(Target, Texel[0], Texel[1], Texel[2], { Velocity.X, Velocity.Y, Velocity.Z, 0.0f });
            }
}

float ResolveOpticalDepth(const PlumeSpace& Space, const PlumeLattice& ThermoState, PlumeVec3 Position, PlumeVec3 Toward)
{
    float Depth = 0.0f;
    float Travel = 0.25f * Space.Record.Lattice[1];
    const unsigned Extent[3] = { Space.Record.ThermoExtent[0], Space.Record.ThermoExtent[1], Space.Record.ThermoExtent[2] };
    for (int Step = 0; Step < 8; ++Step)
    {
        const float Length = Space.Record.Lattice[0] * (1.0f + 0.6f * static_cast<float>(Step));
        const PlumeVec3 Sample = Position + Toward * (Travel + 0.5f * Length);
        if (!ClassifyWindowInterior(Sample, 2 * Space.Record.VelocityOrigin[0], 2 * Space.Record.VelocityOrigin[1], 0,
                                    Extent, Space.Record.Lattice[0], Space.Record.Lattice[2]))
            break;
        const PlumeVec4 Thermo = PlumeMaxVec(SampleRepeatClamp(ThermoState, ProjectThermoCoordinates(Space.Record, Sample)), {});
        Depth += (Thermo.X * Space.Record.Optical[0] + Thermo.W * Space.Record.Optical[2]) * Length;
        Travel += Length;
    }
    return Depth;
}

void ResolveSunTransmittance(PlumeSpace& Space)
{
    const PlumeLattice& ThermoState = Space.Thermo[1 - Space.State];
    const PlumeVec3 Sun = { Space.Record.Sun[0], Space.Record.Sun[1], Space.Record.Sun[2] };
    for (int Z = 0; Z < Space.VelocityExtent[2]; ++Z)
        for (int Y = 0; Y < Space.VelocityExtent[1]; ++Y)
            for (int X = 0; X < Space.VelocityExtent[0]; ++X)
            {
                const PlumeVec3 Position = ProjectVelocityWorld(Space.Record, static_cast<unsigned>(X), static_cast<unsigned>(Y), static_cast<unsigned>(Z));
                const float SunT = std::exp(-ResolveOpticalDepth(Space, ThermoState, Position, Sun) * 0.65f);
                const float Zenith = std::exp(-ResolveOpticalDepth(Space, ThermoState, Position, { 0.0f, 0.0f, 1.0f }) * 0.5f);
                const auto Texel = ResolveVelocityTexel(Space.Record, X, Y, Z);
                StoreTexel(Space.Light, Texel[0], Texel[1], Texel[2], { SunT, Zenith, 0.0f, 1.0f });
            }
}

float ResolveHenyeyGreenstein(float Cosine, float Anisotropy)
{
    const float Squared = Anisotropy * Anisotropy;
    return (1.0f - Squared) / (12.56637061436f * std::pow(std::max(1.0f + Squared - 2.0f * Anisotropy * Cosine, 1.0e-4f), 1.5f));
}

float ResolvePhase(float Cosine, float Anisotropy)
{
    return PlumeMix(ResolveHenyeyGreenstein(Cosine, -0.65f * Anisotropy), ResolveHenyeyGreenstein(Cosine, Anisotropy), 0.72f);
}

float ErodeDensity(float Density, float Noise, float Strength)
{
    const float Thin = 1.0f - std::clamp(Density * 0.8f, 0.0f, 1.0f);
    return std::max(0.0f, Density * (1.0f + Strength * (Noise - 0.5f) * 1.6f)
                    - Strength * Thin * (1.0f - Noise) * 0.35f * std::min(Density, 1.0f));
}

PlumeVec4 SampleDetail(const PlumeSpace& Space, PlumeVec3 Position)
{
    const float Time = Space.Record.Wind[3];
    const PlumeVec3 Drift = PlumeVec3{ -Space.Record.Wind[0] * 0.35f, -Space.Record.Wind[1] * 0.35f, -0.55f } * Time;
    const PlumeVec3 Coordinates = (Position + Drift) * Space.Record.Detail[1];
    float U = Coordinates.X - std::floor(Coordinates.X);
    float V = Coordinates.Y - std::floor(Coordinates.Y);
    float W = Coordinates.Z - std::floor(Coordinates.Z);
    const float Fx = U * static_cast<float>(DetailExtent);
    const float Fy = V * static_cast<float>(DetailExtent);
    const float Fz = W * static_cast<float>(DetailExtent);
    const int X0 = WrapIndex(static_cast<int>(std::floor(Fx)), DetailExtent);
    const int Y0 = WrapIndex(static_cast<int>(std::floor(Fy)), DetailExtent);
    const int Z0 = WrapIndex(static_cast<int>(std::floor(Fz)), DetailExtent);
    const int Offset = ((Z0 * DetailExtent + Y0) * DetailExtent + X0) * 4;
    return { Space.DetailTexels[Offset] / 255.0f, Space.DetailTexels[Offset + 1] / 255.0f,
             Space.DetailTexels[Offset + 2] / 255.0f, Space.DetailTexels[Offset + 3] / 255.0f };
}

PlumeVec3 ResolveFireLight(const PlumeSpace& Space, PlumeVec3 Position)
{
    PlumeVec3 Light{};
    const size_t Count = std::min(Space.FireLights.size(), static_cast<size_t>(FireLightLimit));
    for (size_t Index = 0; Index < Count; ++Index)
    {
        const FireLight& Entry = Space.FireLights[Index];
        const PlumeVec3 Offset = Entry.Position - Position;
        const float Radius = Entry.Radius;
        const float Denom = PlumeDot(Offset, Offset) + Radius * Radius;
        Light = Light + Entry.Radiance * (1.0f / Denom);
    }
    return Light * (0.0795774715f * Space.Record.Scattering[3]);
}

} // namespace

void PlumeSpace::RecordTransport(const SceneDistanceField& Field)
{
    if (!StepPending)
        return;
    Distance = Field;
    AdvectVelocity(*this, Field);
    ResolveCurl(*this);
    ConfineVorticity(*this);
    ResolveDivergence(*this);
    int Slot = 0;
    for (int Sweep = 0; Sweep < Configuration.PressureSweeps; ++Sweep)
    {
        RelaxPressure(*this, Slot);
        Slot = 1 - Slot;
    }
    if (Slot != 0)
        Pressure[0].swap(Pressure[1]);
    ProjectVelocity(*this);
    AdvectThermo(*this, Field);
    ResolveSunTransmittance(*this);
    State = 1 - State;
    StepPending = false;
    ++StepsTaken;
}

void PlumeSpace::RecordMarch(PlumeMarchFrame& Frame) const
{
    Frame.Radiance.assign(static_cast<size_t>(Frame.Width * Frame.Height), { 0, 0, 0, 1 });
    if (!Resident || Frame.Width <= 0 || Frame.Height <= 0)
        return;
    if (Coverage.Low[0] > Coverage.High[0])
        return;
    const PlumeLattice& ThermoState = Thermo[State];
    const float Edge = Record.Lattice[0];
    const PlumeVec3 OriginWorld = { static_cast<float>(2 * Record.VelocityOrigin[0]) * Edge,
                                    static_cast<float>(2 * Record.VelocityOrigin[1]) * Edge,
                                    Record.Lattice[2] };
    const PlumeVec3 BoxMinimum = OriginWorld + PlumeVec3{ static_cast<float>(Coverage.Low[0]) - 1.0f,
                                                          static_cast<float>(Coverage.Low[1]) - 1.0f,
                                                          static_cast<float>(Coverage.Low[2]) - 1.0f } * Edge;
    const PlumeVec3 BoxMaximum = OriginWorld + PlumeVec3{ static_cast<float>(Coverage.High[0]) + 2.0f,
                                                          static_cast<float>(Coverage.High[1]) + 2.0f,
                                                          static_cast<float>(Coverage.High[2]) + 2.0f } * Edge;
    const PlumeVec3 SunDir = PlumeNormalize(Frame.SunDirection);
    const float Anisotropy = Record.Scattering[1];
    const float Strength = Record.Scattering[0];
    const float Flicker = 0.5f + 0.5f * std::sin(Record.Wind[3] * 23.0f);
    const PlumeVec3 SkyAmbient = Frame.SkyAmbient * (Frame.SkyScale * Record.Scattering[2]);
    const PlumeVec3 GroundBounce = Frame.SunIlluminance * (std::max(SunDir.Z, 0.0f) * 0.12f * InversePi * Record.Scattering[2]);
    const bool Cells = Record.ThermoExtent[3] == 1u;

    for (int PixelY = 0; PixelY < Frame.Height; ++PixelY)
        for (int PixelX = 0; PixelX < Frame.Width; ++PixelX)
        {
            const int Pixel = PixelY * Frame.Width + PixelX;
            float Depth = Frame.Depth.empty() ? 1.0e5f : Frame.Depth[static_cast<size_t>(Pixel)];
            if (!(Depth > 0.0f)) Depth = 1.0e5f;
            const float U = (static_cast<float>(PixelX) + 0.5f) / static_cast<float>(Frame.Width) * 2.0f - 1.0f;
            const float V = 1.0f - (static_cast<float>(PixelY) + 0.5f) / static_cast<float>(Frame.Height) * 2.0f;
            const PlumeVec3 Target = { 3.0f, 0.0f, 0.35f };
            const PlumeVec3 Forward = PlumeNormalize(Target - Frame.CameraPosition);
            const PlumeVec3 Right = PlumeNormalize(PlumeCross(Forward, { 0.0f, 0.0f, 1.0f }));
            const PlumeVec3 Up = PlumeCross(Right, Forward);
            PlumeVec3 Direction = PlumeNormalize(Forward + Right * (U * 0.55f) + Up * (V * 0.35f));
            if (Depth < 1.0e4f)
            {
                const PlumeVec3 Far = Frame.CameraPosition + Direction * Depth;
                Direction = PlumeNormalize(Far - Frame.CameraPosition);
            }
            const float Opaque = Depth;
            const PlumeVec3 Inv = { 1.0f / (std::fabs(Direction.X) < 1e-9f ? 1e-9f : Direction.X),
                                    1.0f / (std::fabs(Direction.Y) < 1e-9f ? 1e-9f : Direction.Y),
                                    1.0f / (std::fabs(Direction.Z) < 1e-9f ? 1e-9f : Direction.Z) };
            const PlumeVec3 NearT = PlumeVec3{ BoxMinimum.X - Frame.CameraPosition.X,
                                               BoxMinimum.Y - Frame.CameraPosition.Y,
                                               BoxMinimum.Z - Frame.CameraPosition.Z };
            const PlumeVec3 FarT = PlumeVec3{ BoxMaximum.X - Frame.CameraPosition.X,
                                              BoxMaximum.Y - Frame.CameraPosition.Y,
                                              BoxMaximum.Z - Frame.CameraPosition.Z };
            const float T1x = NearT.X * Inv.X, T2x = FarT.X * Inv.X;
            const float T1y = NearT.Y * Inv.Y, T2y = FarT.Y * Inv.Y;
            const float T1z = NearT.Z * Inv.Z, T2z = FarT.Z * Inv.Z;
            const float Enter = std::max(std::max(std::min(T1x, T2x), std::min(T1y, T2y)), std::max(std::min(T1z, T2z), 0.0f));
            const float Exit = std::min(std::min(std::max(T1x, T2x), std::max(T1y, T2y)), std::min(std::max(T1z, T2z), Opaque));
            if (Exit <= Enter)
                continue;
            const int Count = static_cast<int>(std::clamp(std::ceil((Exit - Enter) / (0.9f * Edge)), 4.0f, std::max(Record.Optical[3], 4.0f)));
            const float Step = (Exit - Enter) / static_cast<float>(Count);
            const float Offset = std::fmod(52.9829189f * std::fmod(0.06711056f * static_cast<float>(PixelX) + 0.00583715f * static_cast<float>(PixelY), 1.0f)
                                           + 0.61803398875f * static_cast<float>(Frame.FrameIndex % 256), 1.0f);
            const float Cosine = PlumeDot(Direction, SunDir);
            const PlumeVec3 PhaseOctaves = { ResolvePhase(Cosine, Anisotropy), ResolvePhase(Cosine, 0.5f * Anisotropy), ResolvePhase(Cosine, 0.25f * Anisotropy) };
            PlumeVec3 Radiance{};
            float Transmittance = 1.0f;
            for (int Index = 0; Index < Count; ++Index)
            {
                if (Transmittance < 0.01f) break;
                const PlumeVec3 Position = Frame.CameraPosition + Direction * (Enter + (static_cast<float>(Index) + Offset) * Step);
                PlumeVec4 Thermo = PlumeMaxVec(SampleRepeatClamp(ThermoState, ProjectThermoCoordinates(Record, Position)), {});
                if (Thermo.X < 1.0e-3f && Thermo.W < 1.0e-3f && Thermo.Z < 1.0e-3f)
                    continue;
                if (Cells)
                {
                    const float Absorbed = 1.0f - std::exp(-(Thermo.X * 1.5f + Thermo.W * 1.5f + Thermo.Z) * Step);
                    const PlumeVec3 Colour = PlumeVec3{ 0.35f, 0.75f, 1.0f } * std::min(Thermo.X, 2.0f)
                                           + PlumeVec3{ 0.55f, 0.3f, 0.9f } * std::min(Thermo.W, 2.0f)
                                           + PlumeVec3{ 1.0f, 0.25f, 0.05f } * std::min(Thermo.Y * 0.02f, 2.0f)
                                           + PlumeVec3{ 1.0f, 0.85f, 0.2f } * std::min(Thermo.Z, 2.0f);
                    Radiance = Radiance + Colour * (Transmittance * Absorbed * 4.0f);
                    Transmittance *= 1.0f - Absorbed;
                    continue;
                }
                if (Record.Detail[0] > 0.0f)
                {
                    const PlumeVec4 Noise = SampleDetail(*this, Position);
                    const float Folded = Noise.X * 0.5f + Noise.Y * 0.3f + Noise.Z * 0.2f;
                    Thermo.X = ErodeDensity(Thermo.X, Folded, Record.Detail[0]);
                    Thermo.W = ErodeDensity(Thermo.W, Folded, Record.Detail[0]);
                    Thermo.Z *= PlumeMix(1.0f, 0.45f + 1.1f * PlumeMix(Noise.W, Flicker, 0.25f), std::min(Record.Detail[0], 1.0f));
                }
                const float SmokeExtinction = Thermo.X * Record.Optical[0];
                const float SootExtinction = Thermo.W * Record.Optical[2];
                const float Particulate = SmokeExtinction + SootExtinction;
                const float Extinction = Particulate + Thermo.Z * 0.8f;
                if (Extinction < 1.0e-4f) continue;
                const float Absorbed = 1.0f - std::exp(-Extinction * Step);
                const float Albedo = (SmokeExtinction * Record.Optical[1] + SootExtinction * Record.Sun[3]) / std::max(Particulate, 1.0e-5f);
                const float Share = Particulate / Extinction;
                const PlumeVec4 ShadowSample = SampleRepeatClamp(Light, ProjectVelocityCoordinates(Record, Position));
                const PlumeVec3 Shadow = { std::clamp(ShadowSample.X, 0.0f, 1.0f), std::clamp(ShadowSample.Y, 0.0f, 1.0f), 0.0f };
                const float Visibility = 1.0f;
                const float Octaves = PhaseOctaves.X * Shadow.X + Strength * Albedo * (0.6f * PhaseOctaves.Y * std::pow(Shadow.X, 0.25f)
                                                                                       + 0.36f * PhaseOctaves.Z * std::pow(Shadow.X, 0.0625f));
                const PlumeVec3 Sunlight = Frame.SunIlluminance * (Visibility * Octaves);
                const PlumeVec3 Sky = SkyAmbient * (0.18f + 0.82f * std::pow(Shadow.Y, 0.6f)) + GroundBounce;
                const PlumeVec3 Scattered = (Sunlight + Sky + ResolveFireLight(*this, Position)) * (Albedo * Share * Absorbed);
                const float Heat = Thermo.Y / (Thermo.Y + Record.Flame[2]);
                const float Temperature = PlumeMix(Record.Flame[1], Record.Flame[0], Heat);
                const PlumeVec3 Emission = ResolveBlackbodyRadiance(Temperature) * (Record.SourceMaximum[3] * std::min(Thermo.Z, 1.5f) * Step);
                Radiance = Radiance + (Scattered + Emission) * Transmittance;
                Transmittance *= 1.0f - Absorbed;
            }
            Frame.Radiance[static_cast<size_t>(Pixel)] = { Radiance.X, Radiance.Y, Radiance.Z, Transmittance };
        }
}

} // namespace Frontier
