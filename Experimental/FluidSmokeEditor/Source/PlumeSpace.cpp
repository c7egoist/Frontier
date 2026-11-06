/*==========================================================================================================================================
                                                             PLUMESPACE.CPP
==========================================================================================================================================*/
// 🧩 1:1 C++ port of PlumeSpace.js — schedule, toroidal window, step record, fire lights and the transport dispatch.

#include "PlumeSpace.h"
#include "PlumeTransport.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace FluidSmoke
{

PlumeSpace::PlumeSpace() : PlumeSpace(PlumeGrades[2]) {}

PlumeSpace::PlumeSpace(const PlumeGrade& Initial) { AssignConfiguration(Initial); }

void PlumeSpace::AssignConfiguration(const PlumeGrade& NewConfiguration) noexcept
{
    Configuration = NewConfiguration;
    ThermoExtent = { static_cast<uint32_t>(NewConfiguration.Extent[0]), static_cast<uint32_t>(NewConfiguration.Extent[1]),
                     static_cast<uint32_t>(NewConfiguration.Extent[2]) };
    VelocityExtent = { ThermoExtent.X / 2, ThermoExtent.Y / 2, ThermoExtent.Z / 2 };
    CoarseEdge = 2.0f * NewConfiguration.CellExtent;
    Origin = { 0, 0 };
    PriorOrigin = { RestartOrigin, RestartOrigin };
    AllocateLattices();
}

void PlumeSpace::AllocateLattices()
{
    const size_t Coarse = static_cast<size_t>(VelocityExtent.X) * VelocityExtent.Y * VelocityExtent.Z;
    const size_t Fine = static_cast<size_t>(ThermoExtent.X) * ThermoExtent.Y * ThermoExtent.Z;
    for (int S = 0; S < 2; ++S)
    {
        Velocity[S].assign(Coarse, Vec4{});
        Thermo[S].assign(Fine, Vec4{});
    }
    Light.assign(Coarse, Vec4{ 0, 0, 0, 1 });
    Curl.assign(Coarse, Vec4{});
    Divergence.assign(Coarse, 0.0f);
    Pressure[0].assign(Coarse, 0.0f);
    Pressure[1].assign(Coarse, 0.0f);
    State = 0;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   SCHEDULE
//------------------------------------------------------------------------------------------------------------------------

void PlumeSpace::Schedule(float Seconds, float FrameSeconds, const Vec3& Focus, const PlumeSourceProjection& Sources,
                          const PlumeSettings& Settings, const Vec3& Sun)
{
    SunDirection = Sun.empty() ? Vec3{ 0.0f, 0.0f, 1.0f } : Sun;
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
    const float DeltaTau = std::min(Accumulator, StepCeiling);
    Accumulator = 0.0f;
    RecentreWindow(Focus, false);
    EncodeRecord(DeltaTau, FrameSeconds, Sources, Settings);
    for (int Index = 0; Index < Sources.Count; ++Index)
    {
        const float* R = &Sources.Records[Index * SourceStride];
        SourceRecords[Index] = PlumeSource{ { R[0], R[1], R[2] }, R[3], { R[4], R[5], R[6] }, R[7], R[8], R[9], R[10], R[11] };
    }
    Coverage = { 0x7FFFFFFF, 0x7FFFFFFF, 0x7FFFFFFF, 0, -0x7FFFFFFF, -0x7FFFFFFF, -0x7FFFFFFF, 0 };
    StepPending = true;
}

void PlumeSpace::RecentreWindow(const Vec3& Focus, bool Force) noexcept
{
    const int CellX = static_cast<int>(std::floor(Focus[0] / CoarseEdge));
    const int CellY = static_cast<int>(std::floor(Focus[1] / CoarseEdge));
    const int HalfX = static_cast<int>(VelocityExtent.X) >> 1;
    const int HalfY = static_cast<int>(VelocityExtent.Y) >> 1;
    const int CentreX = Origin[0] + HalfX, CentreY = Origin[1] + HalfY;
    if (Force || std::abs(CellX - CentreX) > HalfX / 2 || std::abs(CellY - CentreY) > HalfY / 2)
        Origin = { CellX - HalfX, CellY - HalfY };
}

void PlumeSpace::EncodeRecord(float DeltaTau, float FrameSeconds, const PlumeSourceProjection& Sources, const PlumeSettings& Settings) noexcept
{
    // 📝 Frontier's continuous fade once the sources stop: whatever remains reaches zero at FadeCeiling.
    float Fade = 1.0f;
    if (QuietSeconds > 0.0f)
    {
        const float Remaining = std::max(0.0f, FadeCeiling - QuietSeconds);
        Fade = Remaining / std::max(DeltaTau, FadeCeiling - QuietPrior);
    }
    QuietPrior = QuietSeconds;
    const float Dissipation = std::min(0.95f, Settings.PlumeDissipation);
    const float WindAngle = Settings.PlumeWindDirection * Pi / 180.0f;
    const Vec3 Wind = { std::cos(WindAngle) * Settings.PlumeWindSpeed, std::sin(WindAngle) * Settings.PlumeWindSpeed, 0.0f };
    const float Edge = Configuration.CellExtent;

    Record = PlumeRecord{};
    Record.VelocityOrigin = { Origin[0], Origin[1], 0 };
    Record.StepOrdinal = StepOrdinal++;
    Record.PriorVelocityOrigin = { PriorOrigin[0], PriorOrigin[1], 0 };
    Record.SourceCount = Sources.Count;
    Record.VelocityExtent = VelocityExtent;
    Record.ThermoExtent = ThermoExtent;
    Record.Inspection = 0;
    Record.LatticeA = { Edge, 2.0f * Edge, FloorHeight };
    Record.StepSeconds = DeltaTau;
    Record.ForceXyz = { Settings.PlumeBuoyancy, 0.12f, Settings.PlumeVorticity };
    Record.Turbulence = Settings.PlumeTurbulence;
    Record.RetentionXyz = { std::pow(1.0f - Dissipation, DeltaTau) * Fade,
                            std::pow(1.0f - std::min(0.95f, Settings.PlumeCooling), DeltaTau) * Fade,
                            std::exp(-Settings.PlumeFlameDecay * DeltaTau) * Fade };
    Record.VelocityRetention = std::pow(1.0f - 0.08f, DeltaTau);
    Record.Wind = Wind;
    Record.ElapsedSeconds = ElapsedSeconds;
    const SourceBounds Bounds = Sources.ResolveBounds();
    Record.SourceMinimum = { std::isfinite(Bounds.Minimum[0]) ? Bounds.Minimum[0] : 0.0f,
                             std::isfinite(Bounds.Minimum[1]) ? Bounds.Minimum[1] : 0.0f,
                             std::isfinite(Bounds.Minimum[2]) ? Bounds.Minimum[2] : 0.0f };
    Record.FrameSeconds = std::max(FrameSeconds, 1.0e-3f);
    Record.SourceMaximum = { std::isfinite(Bounds.Maximum[0]) ? Bounds.Maximum[0] : 0.0f,
                             std::isfinite(Bounds.Maximum[1]) ? Bounds.Maximum[1] : 0.0f,
                             std::isfinite(Bounds.Maximum[2]) ? Bounds.Maximum[2] : 0.0f };
    Record.FlameScale = FlameScale * Settings.PlumeFire;
    Record.SmokeExtinction = Settings.PlumeExtinction;
    Record.SmokeAlbedo = Settings.PlumeAlbedo;
    Record.SootExtinction = 3.0f * Settings.PlumeExtinction;
    Record.MarchSamples = static_cast<float>(Configuration.MarchSamples);
    Record.Sun = SunDirection;
    Record.SootAlbedo = Settings.PlumeSootAlbedo;
    Record.SootShed = 2.4f * Settings.PlumeSoot;
    Record.HeatRelease = 25.0f * Settings.PlumeHeat;
    Record.SootRetention = std::pow(1.0f - 0.8f * Dissipation, DeltaTau) * Fade;
    Record.Scattering = Settings.PlumeScattering;
    Record.Anisotropy = Settings.PlumeAnisotropy;
    Record.AmbientScale = Settings.PlumeAmbient;
    Record.FireLightScale = Settings.PlumeFireLight;
    Record.Detail = Settings.PlumeDetail;
    Record.DetailScale = Settings.PlumeDetailScale;
    Record.TurbulenceScale = Settings.PlumeTurbulenceScale;
    Record.FlameCore = Settings.PlumeFlameCore;
    Record.FlameTip = Settings.PlumeFlameTip;
    Record.FlameHeatThreshold = 30.0f;
    PriorOrigin = Origin;
}

void PlumeSpace::AssignFireLights(const std::vector<FireLight>& Lights) noexcept
{
    FireLights = FireLightRecord{};
    const uint32_t Count = std::min<uint32_t>(FireLightLimit, static_cast<uint32_t>(Lights.size()));
    FireLights.Count = Count;
    for (uint32_t Index = 0; Index < Count; ++Index)
    {
        FireLights.Position[Index] = Lights[Index].Position;
        FireLights.Radius[Index] = Lights[Index].Radius;
        FireLights.Radiance[Index] = Lights[Index].Radiance;
    }
}

void PlumeSpace::Clear() noexcept
{
    Resident = false;
    StepPending = false;
    QuietSeconds = 0.0f;
    PriorOrigin = { RestartOrigin, RestartOrigin };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   TRANSPORT
//------------------------------------------------------------------------------------------------------------------------

void PlumeSpace::RecordTransport(const SceneDistanceField& Field)
{
    if (!StepPending)
        return;
    const int S = State;
    const int CoarseX = static_cast<int>(VelocityExtent.X), CoarseY = static_cast<int>(VelocityExtent.Y),
              CoarseZ = static_cast<int>(VelocityExtent.Z);
    const int FineX = static_cast<int>(ThermoExtent.X), FineY = static_cast<int>(ThermoExtent.Y),
              FineZ = static_cast<int>(ThermoExtent.Z);
    (void)CoarseX; (void)CoarseY; (void)CoarseZ; (void)FineX; (void)FineY; (void)FineZ;
    AdvectVelocity(*this, Field);
    ResolveCurl(*this);
    ConfineVorticity(*this);
    ResolveDivergence(*this);
    for (int Sweep = 0; Sweep < Configuration.PressureSweeps; ++Sweep)
        RelaxPressure(*this, Sweep & 1);
    ProjectVelocity(*this, Configuration.PressureSweeps & 1);
    AdvectThermo(*this, Field);
    ResolveSunTransmittance(*this);
    State = 1 - S;
    StepPending = false;
    StepsTaken++;
}

PlumeDescription PlumeSpace::QueryDescription() const noexcept
{
    PlumeDescription D;
    char Buffer[160];
    std::snprintf(Buffer, sizeof(Buffer), "%u×%u×%u @ %.0f cm", ThermoExtent.X, ThermoExtent.Y, ThermoExtent.Z,
                  Configuration.CellExtent * 100.0f);
    D.Thermo = Buffer;
    std::snprintf(Buffer, sizeof(Buffer), "%u×%u×%u @ %.0f cm", VelocityExtent.X, VelocityExtent.Y, VelocityExtent.Z,
                  2.0f * Configuration.CellExtent * 100.0f);
    D.Velocity = Buffer;
    std::snprintf(Buffer, sizeof(Buffer), "%.0f × %.0f × %.0f m", ThermoExtent.X * Configuration.CellExtent,
                  ThermoExtent.Y * Configuration.CellExtent, ThermoExtent.Z * Configuration.CellExtent);
    D.Span = Buffer;
    D.Cells = static_cast<long long>(ThermoExtent.X) * ThermoExtent.Y * ThermoExtent.Z
            + static_cast<long long>(VelocityExtent.X) * VelocityExtent.Y * VelocityExtent.Z;
    D.Bytes = D.Cells * 16;
    D.Grade = Configuration.Name;
    D.Sweeps = Configuration.PressureSweeps;
    D.Samples = Configuration.MarchSamples;
    return D;
}

} // namespace FluidSmoke
