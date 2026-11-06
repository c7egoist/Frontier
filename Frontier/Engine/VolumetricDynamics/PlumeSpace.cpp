/*==========================================================================================================================================
                                                             PLUMESPACE.CPP
==========================================================================================================================================*/
// 🧩 Host of Source/PlumeSpace.js: configuration, detail volume, residency, EncodeRecord, RecentreWindow.

#include "Frontier/Engine/VolumetricDynamics/PlumeSpace.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <sstream>

namespace Frontier
{

namespace
{

uint32_t DetailHash(int X, int Y, int Z, int Period, int Seed)
{
    auto Wrap = [&](int V) {
        int W = V % Period;
        if (W < 0) W += Period;
        return W;
    };
    int Word = (Wrap(X) * 73856093) ^ (Wrap(Y) * 19349663) ^ (Wrap(Z) * 83492791) ^ (Seed * 2654435761);
    auto Imul = [](int A, int B) { return static_cast<int>(static_cast<uint32_t>(A) * static_cast<uint32_t>(B)); };
    Word = Imul(Word ^ (static_cast<uint32_t>(Word) >> 15), 0x2C1B3C6D);
    Word = Imul(Word ^ (static_cast<uint32_t>(Word) >> 12), 0x297A2D39);
    return (static_cast<uint32_t>(Word ^ (static_cast<uint32_t>(Word) >> 15))) ;
}

float DetailHashUnit(int X, int Y, int Z, int Period, int Seed)
{
    return static_cast<float>(DetailHash(X, Y, Z, Period, Seed)) / 4294967296.0f;
}

float Smooth(float Fraction) { return Fraction * Fraction * (3.0f - 2.0f * Fraction); }

float ValueNoise(int X, int Y, int Z, int Period, int Seed)
{
    const float Scale = static_cast<float>(Period) / static_cast<float>(DetailExtent);
    const float U = static_cast<float>(X) * Scale;
    const float V = static_cast<float>(Y) * Scale;
    const float W = static_cast<float>(Z) * Scale;
    const int I = static_cast<int>(std::floor(U));
    const int J = static_cast<int>(std::floor(V));
    const int K = static_cast<int>(std::floor(W));
    const float A = Smooth(U - static_cast<float>(I));
    const float B = Smooth(V - static_cast<float>(J));
    const float C = Smooth(W - static_cast<float>(K));
    float Sum = 0.0f;
    for (int Corner = 0; Corner < 8; ++Corner)
    {
        const int Dx = Corner & 1, Dy = (Corner >> 1) & 1, Dz = (Corner >> 2) & 1;
        Sum += DetailHashUnit(I + Dx, J + Dy, K + Dz, Period, Seed)
             * (Dx ? A : 1.0f - A) * (Dy ? B : 1.0f - B) * (Dz ? C : 1.0f - C);
    }
    return Sum;
}

float Worley(int X, int Y, int Z, int Period, int Seed)
{
    const float Scale = static_cast<float>(Period) / static_cast<float>(DetailExtent);
    const float U = static_cast<float>(X) * Scale;
    const float V = static_cast<float>(Y) * Scale;
    const float W = static_cast<float>(Z) * Scale;
    const int I = static_cast<int>(std::floor(U));
    const int J = static_cast<int>(std::floor(V));
    const int K = static_cast<int>(std::floor(W));
    float Nearest = 9.0f;
    for (int Dz = -1; Dz <= 1; ++Dz)
        for (int Dy = -1; Dy <= 1; ++Dy)
            for (int Dx = -1; Dx <= 1; ++Dx)
            {
                const int Cx = I + Dx, Cy = J + Dy, Cz = K + Dz;
                const float Px = static_cast<float>(Cx) + DetailHashUnit(Cx, Cy, Cz, Period, Seed);
                const float Py = static_cast<float>(Cy) + DetailHashUnit(Cx, Cy, Cz, Period, Seed + 1);
                const float Pz = static_cast<float>(Cz) + DetailHashUnit(Cx, Cy, Cz, Period, Seed + 2);
                const float Dxv = Px - U, Dyv = Py - V, Dzv = Pz - W;
                Nearest = std::min(Nearest, Dxv * Dxv + Dyv * Dyv + Dzv * Dzv);
            }
    return std::max(0.0f, 1.0f - std::sqrt(Nearest));
}

float ReadSetting(const PlumeSettings& Settings, const char* Key, float Fallback)
{
    if (std::strcmp(Key, "PlumeBuoyancy") == 0) return Settings.PlumeBuoyancy;
    if (std::strcmp(Key, "PlumeVorticity") == 0) return Settings.PlumeVorticity;
    if (std::strcmp(Key, "PlumeTurbulence") == 0) return Settings.PlumeTurbulence;
    if (std::strcmp(Key, "PlumeDissipation") == 0) return Settings.PlumeDissipation;
    if (std::strcmp(Key, "PlumeCooling") == 0) return Settings.PlumeCooling;
    if (std::strcmp(Key, "PlumeFlameDecay") == 0) return Settings.PlumeFlameDecay;
    if (std::strcmp(Key, "PlumeWindSpeed") == 0) return Settings.PlumeWindSpeed;
    if (std::strcmp(Key, "PlumeWindDirection") == 0) return Settings.PlumeWindDirection;
    if (std::strcmp(Key, "PlumeFire") == 0) return Settings.PlumeFire;
    if (std::strcmp(Key, "PlumeExtinction") == 0) return Settings.PlumeExtinction;
    if (std::strcmp(Key, "PlumeAlbedo") == 0) return Settings.PlumeAlbedo;
    if (std::strcmp(Key, "PlumeSootAlbedo") == 0) return Settings.PlumeSootAlbedo;
    if (std::strcmp(Key, "PlumeSoot") == 0) return Settings.PlumeSoot;
    if (std::strcmp(Key, "PlumeHeat") == 0) return Settings.PlumeHeat;
    if (std::strcmp(Key, "PlumeScattering") == 0) return Settings.PlumeScattering;
    if (std::strcmp(Key, "PlumeAnisotropy") == 0) return Settings.PlumeAnisotropy;
    if (std::strcmp(Key, "PlumeAmbient") == 0) return Settings.PlumeAmbient;
    if (std::strcmp(Key, "PlumeFireLight") == 0) return Settings.PlumeFireLight;
    if (std::strcmp(Key, "PlumeDetail") == 0) return Settings.PlumeDetail;
    if (std::strcmp(Key, "PlumeDetailScale") == 0) return Settings.PlumeDetailScale;
    if (std::strcmp(Key, "PlumeTurbulenceScale") == 0) return Settings.PlumeTurbulenceScale;
    if (std::strcmp(Key, "PlumeFlameCore") == 0) return Settings.PlumeFlameCore;
    if (std::strcmp(Key, "PlumeFlameTip") == 0) return Settings.PlumeFlameTip;
    return Fallback;
}

}

PlumeSpace::PlumeSpace(int GradeIndex)
{
    const auto& Grades = QueryPlumeGrades();
    AssignConfiguration(Grades[static_cast<size_t>(std::clamp(GradeIndex, 0, 3))]);
    ConstructDetail();
}

void PlumeSpace::AssignConfiguration(const PlumeGrade& Next)
{
    Configuration = Next;
    ThermoExtent = Next.Extent;
    VelocityExtent = { Next.Extent[0] / 2, Next.Extent[1] / 2, Next.Extent[2] / 2 };
    CoarseEdge = 2.0f * Next.CellExtent;
    Origin = { 0, 0 };
    PriorOrigin = { RestartOrigin, RestartOrigin };
    ConstructLattices();
}

void PlumeSpace::ReconstructGrade(int GradeIndex)
{
    AssignConfiguration(QueryPlumeGrades()[static_cast<size_t>(std::clamp(GradeIndex, 0, 3))]);
}

void PlumeSpace::ConstructLattices()
{
    for (int Slot = 0; Slot < 2; ++Slot)
    {
        Velocity[Slot].Construct(VelocityExtent[0], VelocityExtent[1], VelocityExtent[2]);
        Thermo[Slot].Construct(ThermoExtent[0], ThermoExtent[1], ThermoExtent[2]);
        Pressure[Slot].assign(static_cast<size_t>(VelocityExtent[0] * VelocityExtent[1] * VelocityExtent[2]), 0.0f);
    }
    Light.Construct(VelocityExtent[0], VelocityExtent[1], VelocityExtent[2]);
    Curl.assign(static_cast<size_t>(Velocity[0].Count()), {});
    Divergence.assign(static_cast<size_t>(Velocity[0].Count()), 0.0f);
    State = 0;
    Clear();
}

void PlumeSpace::ConstructDetail()
{
    const int Edge = DetailExtent;
    DetailTexels.assign(static_cast<size_t>(Edge * Edge * Edge * 4), 0);
    for (int Z = 0; Z < Edge; ++Z)
        for (int Y = 0; Y < Edge; ++Y)
            for (int X = 0; X < Edge; ++X)
            {
                const int Offset = ((Z * Edge + Y) * Edge + X) * 4;
                const float Billow = Worley(X, Y, Z, 4, 11);
                DetailTexels[Offset]     = static_cast<uint8_t>(std::round(255.0f * (0.55f * ValueNoise(X, Y, Z, 4, 1) + 0.45f * Billow)));
                DetailTexels[Offset + 1] = static_cast<uint8_t>(std::round(255.0f * (0.6f * ValueNoise(X, Y, Z, 8, 2) + 0.4f * Worley(X, Y, Z, 8, 21))));
                DetailTexels[Offset + 2] = static_cast<uint8_t>(std::round(255.0f * ValueNoise(X, Y, Z, 16, 3)));
                DetailTexels[Offset + 3] = static_cast<uint8_t>(std::round(255.0f * ValueNoise(X, Y, Z, 8, 4)));
            }
}

void PlumeSpace::Clear()
{
    Resident = false;
    StepPending = false;
    QuietSeconds = 0.0f;
    PriorOrigin = { RestartOrigin, RestartOrigin };
    Coverage = {};
    for (int Slot = 0; Slot < 2; ++Slot)
    {
        std::fill(Velocity[Slot].Cells.begin(), Velocity[Slot].Cells.end(), PlumeVec4{});
        std::fill(Thermo[Slot].Cells.begin(), Thermo[Slot].Cells.end(), PlumeVec4{});
        std::fill(Pressure[Slot].begin(), Pressure[Slot].end(), 0.0f);
    }
    std::fill(Light.Cells.begin(), Light.Cells.end(), PlumeVec4{});
}

void PlumeSpace::RecentreWindow(PlumeVec3 Focus, bool Force)
{
    const int CellX = static_cast<int>(std::floor(Focus.X / CoarseEdge));
    const int CellY = static_cast<int>(std::floor(Focus.Y / CoarseEdge));
    const int HalfX = VelocityExtent[0] >> 1;
    const int HalfY = VelocityExtent[1] >> 1;
    const int CentreX = Origin[0] + HalfX;
    const int CentreY = Origin[1] + HalfY;
    if (Force || std::abs(CellX - CentreX) > HalfX / 2 || std::abs(CellY - CentreY) > HalfY / 2)
        Origin = { CellX - HalfX, CellY - HalfY };
}

void PlumeSpace::EncodeRecord(float DeltaSeconds, float FrameSeconds, const PlumeSourceProjection& Sources, const PlumeSettings& Settings)
{
    float Fade = 1.0f;
    if (QuietSeconds > 0.0f)
    {
        const float Remaining = std::max(0.0f, FadeCeiling - QuietSeconds);
        Fade = Remaining / std::max(DeltaSeconds, FadeCeiling - QuietPrior);
    }
    QuietPrior = QuietSeconds;
    const float Dissipation = std::min(0.95f, ReadSetting(Settings, "PlumeDissipation", 0.10f));
    const float WindAngle = ReadSetting(Settings, "PlumeWindDirection", 30.0f) * 3.14159265358979f / 180.0f;
    const float WindSpeed = ReadSetting(Settings, "PlumeWindSpeed", 0.8f);
    const PlumeVec3 Wind = { std::cos(WindAngle) * WindSpeed, std::sin(WindAngle) * WindSpeed, 0.0f };
    const float Edge = Configuration.CellExtent;
    const auto Bounds = Sources.ResolveBounds();

    Record = {};
    Record.VelocityOrigin[0] = Origin[0];
    Record.VelocityOrigin[1] = Origin[1];
    Record.VelocityOrigin[3] = StepOrdinal++;
    Record.PriorVelocityOrigin[0] = PriorOrigin[0];
    Record.PriorVelocityOrigin[1] = PriorOrigin[1];
    Record.PriorVelocityOrigin[3] = Sources.Count;
    Record.VelocityExtent[0] = static_cast<unsigned>(VelocityExtent[0]);
    Record.VelocityExtent[1] = static_cast<unsigned>(VelocityExtent[1]);
    Record.VelocityExtent[2] = static_cast<unsigned>(VelocityExtent[2]);
    Record.ThermoExtent[0] = static_cast<unsigned>(ThermoExtent[0]);
    Record.ThermoExtent[1] = static_cast<unsigned>(ThermoExtent[1]);
    Record.ThermoExtent[2] = static_cast<unsigned>(ThermoExtent[2]);
    Record.ThermoExtent[3] = Settings.Inspection == 10 ? 1u : 0u;
    Record.Lattice[0] = Edge;
    Record.Lattice[1] = 2.0f * Edge;
    Record.Lattice[2] = FloorHeight;
    Record.Lattice[3] = DeltaSeconds;
    Record.Forces[0] = ReadSetting(Settings, "PlumeBuoyancy", 2.4f);
    Record.Forces[1] = 0.12f;
    Record.Forces[2] = ReadSetting(Settings, "PlumeVorticity", 3.0f);
    Record.Forces[3] = ReadSetting(Settings, "PlumeTurbulence", 0.6f);
    Record.Retention[0] = std::pow(1.0f - Dissipation, DeltaSeconds) * Fade;
    Record.Retention[1] = std::pow(1.0f - std::min(0.95f, ReadSetting(Settings, "PlumeCooling", 0.55f)), DeltaSeconds) * Fade;
    Record.Retention[2] = std::exp(-ReadSetting(Settings, "PlumeFlameDecay", 4.0f) * DeltaSeconds) * Fade;
    Record.Retention[3] = std::pow(1.0f - 0.08f, DeltaSeconds);
    Record.Wind[0] = Wind.X; Record.Wind[1] = Wind.Y; Record.Wind[2] = Wind.Z; Record.Wind[3] = ElapsedSeconds;
    Record.SourceMinimum[0] = std::isfinite(Bounds[0]) ? Bounds[0] : 0.0f;
    Record.SourceMinimum[1] = std::isfinite(Bounds[1]) ? Bounds[1] : 0.0f;
    Record.SourceMinimum[2] = std::isfinite(Bounds[2]) ? Bounds[2] : 0.0f;
    Record.SourceMinimum[3] = std::max(FrameSeconds, 1.0e-3f);
    Record.SourceMaximum[0] = std::isfinite(Bounds[3]) ? Bounds[3] : 0.0f;
    Record.SourceMaximum[1] = std::isfinite(Bounds[4]) ? Bounds[4] : 0.0f;
    Record.SourceMaximum[2] = std::isfinite(Bounds[5]) ? Bounds[5] : 0.0f;
    Record.SourceMaximum[3] = FlameScale * ReadSetting(Settings, "PlumeFire", 1.0f);
    Record.Optical[0] = ReadSetting(Settings, "PlumeExtinction", 3.6f);
    Record.Optical[1] = ReadSetting(Settings, "PlumeAlbedo", 0.88f);
    Record.Optical[2] = 3.0f * ReadSetting(Settings, "PlumeExtinction", 3.6f);
    Record.Optical[3] = static_cast<float>(Configuration.MarchSamples);
    Record.Sun[0] = SunDirection.X; Record.Sun[1] = SunDirection.Y; Record.Sun[2] = SunDirection.Z;
    Record.Sun[3] = ReadSetting(Settings, "PlumeSootAlbedo", 0.05f);
    Record.Combustion[0] = 2.4f * ReadSetting(Settings, "PlumeSoot", 1.0f);
    Record.Combustion[1] = 25.0f * ReadSetting(Settings, "PlumeHeat", 1.0f);
    Record.Combustion[2] = std::pow(1.0f - 0.8f * Dissipation, DeltaSeconds) * Fade;
    Record.Scattering[0] = ReadSetting(Settings, "PlumeScattering", 0.75f);
    Record.Scattering[1] = ReadSetting(Settings, "PlumeAnisotropy", 0.38f);
    Record.Scattering[2] = ReadSetting(Settings, "PlumeAmbient", 1.0f);
    Record.Scattering[3] = ReadSetting(Settings, "PlumeFireLight", 1.0f);
    Record.Detail[0] = ReadSetting(Settings, "PlumeDetail", 0.7f);
    Record.Detail[1] = ReadSetting(Settings, "PlumeDetailScale", 2.2f);
    Record.Detail[2] = ReadSetting(Settings, "PlumeTurbulenceScale", 3.7f);
    Record.Flame[0] = ReadSetting(Settings, "PlumeFlameCore", 1800.0f);
    Record.Flame[1] = ReadSetting(Settings, "PlumeFlameTip", 1150.0f);
    Record.Flame[2] = 30.0f;
    std::memcpy(RecordBytes.data(), &Record, sizeof(Record));
    PriorOrigin = Origin;

    PackedSources.clear();
    for (int Index = 0; Index < Sources.Count; ++Index)
    {
        const int Offset = Index * SourceStride;
        PlumeSource Source{};
        Source.PositionRadius = { Sources.Records[Offset], Sources.Records[Offset + 1], Sources.Records[Offset + 2], Sources.Records[Offset + 3] };
        Source.Velocity = { Sources.Records[Offset + 4], Sources.Records[Offset + 5], Sources.Records[Offset + 6], Sources.Records[Offset + 7] };
        Source.Rates = { Sources.Records[Offset + 8], Sources.Records[Offset + 9], Sources.Records[Offset + 10], Sources.Records[Offset + 11] };
        PackedSources.push_back(Source);
    }
}

void PlumeSpace::Schedule(float Seconds, float FrameSeconds, PlumeVec3 Focus,
                          const PlumeSourceProjection& Sources, const PlumeSettings& Settings, PlumeVec3 Sun)
{
    SunDirection = Sun;
    StepPending = false;
    const bool Active = Settings.PlumeEnabled && Sources.Count > 0;
    if (Active)
    {
        QuietSeconds = 0.0f;
        if (!Resident)
        {
            Resident = true;
            PriorOrigin = { RestartOrigin, RestartOrigin };
            Accumulator = StepSeconds;
            QuietPrior = 0.0f;
            RecentreWindow(Focus, true);
        }
    }
    else if (Resident)
    {
        QuietSeconds += Seconds;
        if (QuietSeconds >= FadeCeiling || !Settings.PlumeEnabled)
            Resident = false;
    }
    if (!Resident)
    {
        Accumulator = 0.0f;
        return;
    }
    Accumulator += Seconds;
    ElapsedSeconds += Seconds;
    if (Accumulator < StepSeconds)
        return;
    const float Delta = std::min(Accumulator, StepCeiling);
    Accumulator = 0.0f;
    RecentreWindow(Focus, false);
    EncodeRecord(Delta, FrameSeconds, Sources, Settings);
    Coverage.Low[0] = Coverage.Low[1] = Coverage.Low[2] = 0x7FFFFFFF;
    Coverage.High[0] = Coverage.High[1] = Coverage.High[2] = -0x7FFFFFFF;
    StepPending = true;
}

void PlumeSpace::AssignFireLights(const std::vector<FireLight>& Lights)
{
    FireLights = Lights;
    if (FireLights.size() > FireLightLimit)
        FireLights.resize(FireLightLimit);
}

PlumeDescription PlumeSpace::QueryDescription() const
{
    PlumeDescription Description;
    const int X = ThermoExtent[0], Y = ThermoExtent[1], Z = ThermoExtent[2];
    const int CX = VelocityExtent[0], CY = VelocityExtent[1], CZ = VelocityExtent[2];
    const float Edge = Configuration.CellExtent;
    std::ostringstream Thermo;
    Thermo << X << "×" << Y << "×" << Z << " @ " << static_cast<int>(Edge * 100.0f) << " cm";
    Description.Thermo = Thermo.str();
    std::ostringstream VelocityText;
    VelocityText << CX << "×" << CY << "×" << CZ << " @ " << static_cast<int>(2.0f * Edge * 100.0f) << " cm";
    Description.Velocity = VelocityText.str();
    std::ostringstream Span;
    Span << static_cast<int>(X * Edge) << " × " << static_cast<int>(Y * Edge) << " × " << static_cast<int>(Z * Edge) << " m";
    Description.Span = Span.str();
    Description.Grade = Configuration.Name;
    Description.Cells = X * Y * Z + CX * CY * CZ;
    Description.Sweeps = Configuration.PressureSweeps;
    Description.Samples = Configuration.MarchSamples;
    return Description;
}

std::vector<std::string> PlumeSpace::QueryReadout() const
{
    const PlumeDescription Description = QueryDescription();
    std::ostringstream Line0;
    Line0 << "Slate 3c987f3 plume · " << Description.Grade << " · " << Description.Thermo;
    std::ostringstream Line1;
    Line1 << "sources " << PackedSources.size() << " · steps " << StepsTaken << " · " << (Resident ? "resident" : "idle");
    return { Line0.str(), Line1.str() };
}

} // namespace Frontier
