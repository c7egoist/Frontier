/*==========================================================================================================================================
                                                           SMOKESEQUENCE.CPP
==========================================================================================================================================*/

#include "SmokeSequence.h"

#include <algorithm>
#include <cmath>

namespace FluidSmoke
{

SmokeSequence::SmokeSequence() : PlumeSpace(PlumeGrades[2]) {}
SmokeSequence::SmokeSequence(const PlumeGrade& Grade) : PlumeSpace(Grade) {}

void SmokeSequence::Advance(float Seconds, bool Enabled, const PlumeTelemetry& Telemetry, const SourceOptions& SourceOpts,
                            const PlumeSettings& Settings, const Vec3& Focus, const Vec3& SunDirection,
                            const SceneDistanceField& Field, const std::vector<EmissionRequest>& Emissions)
{
    const float Step = std::min(0.1f, Seconds);
    Sources.Project(Telemetry, Step, SourceOpts);
    // Preserve editor/fracture/burst plumes without duplicating the four tyre sources.
    for (size_t Index = 4; Index < Emissions.size(); ++Index)
    {
        const EmissionRequest& E = Emissions[Index];
        if (!E.Active || Sources.Count >= SourceCapacity)
            continue;
        float* R = &Sources.Records[Sources.Count * SourceStride];
        R[0] = E.Position[0]; R[1] = E.Position[1]; R[2] = E.Position[2]; R[3] = E.Radius;
        R[4] = E.Velocity[0]; R[5] = E.Velocity[1]; R[6] = E.Velocity[2]; R[7] = 0.0f;
        R[8] = E.SmokeRate; R[9] = E.HeatRate; R[10] = E.FlameRate; R[11] = E.SootRate;
        Sources.Count++;
    }
    Schedule(Step, Seconds, Focus, Sources, Settings, SunDirection);
    static const std::vector<FluidSmoke::FireLight> NoLights;
    const std::vector<FluidSmoke::FireLight>& Lamps = Enabled ? Sources.Lights : NoLights;
    AssignFireLights(Lamps);
    RecordTransport(Field);
    Metrics.Sources = Sources.Count;
    Metrics.Ticks = StepsTaken;
    if (!HasLastOrigin || LastOrigin != Origin)
        Metrics.Relocations++;
    LastOrigin = Origin;
    HasLastOrigin = true;
    float Total = 0.0f;
    for (const FluidSmoke::FireLight& L : Lamps)
        Total += L.Radiance[0];
    FireLight.Intensity = Total;
    if (Total > 0.0f)
    {
        Vec3 Weighted = { 0, 0, 0 };
        for (const FluidSmoke::FireLight& L : Lamps)
            Weighted = AddVector(Weighted, ScaleVector(L.Position, L.Radiance[0]));
        FireLight.Position = ScaleVector(Weighted, 1.0f / Total);
    }
}

void SmokeSequence::Clear() noexcept
{
    PlumeSpace::Clear();
    Sources.Reset();
    FireLight.Intensity = 0.0f;
}

std::array<std::string, 2> SmokeSequence::QueryReadout() const noexcept
{
    const PlumeDescription D = QueryDescription();
    return { "Slate 3c987f3 plume · " + D.Grade + " · " + D.Thermo,
             "sources " + std::to_string(Sources.Count) + " · steps " + std::to_string(StepsTaken) + " · "
             + (Resident ? "resident" : "idle") };
}

} // namespace FluidSmoke
