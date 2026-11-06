/*==========================================================================================================================================
                                                      PLUMESOURCEPROJECTION.CPP
==========================================================================================================================================*/
// 🧩 Source/PlumeSourceProjection.js and IlluminationHost.ResolveTestPlume.

#include "Frontier/Engine/VolumetricDynamics/PlumeSourceProjection.h"

#include <algorithm>
#include <cmath>

namespace Frontier
{

namespace
{
constexpr float WarmBase = 333.15f;
constexpr float WarmSpan = 190.0f;
constexpr float FlingShare = 0.35f;
constexpr float FlingCeiling = 9.0f;
constexpr float ArchShare = 0.35f;
constexpr float FireColour[3] = { 1.0f, 0.46f, 0.14f };
constexpr float FireLightGain = 0.00042f;
constexpr float FlameSidewallReach = 0.24f;
constexpr float FlameRise = 2.6f;
}

PlumeSourceProjection::PlumeSourceProjection()
{
    Reset();
}

void PlumeSourceProjection::Reset()
{
    for (SourceOnset& Onset : Onsets)
        Onset = {};
    PopSeconds = {};
    Count = 0;
    ActiveTyres = 0;
    Lights.clear();
    Records.fill(0.0f);
}

float PlumeSourceProjection::ProjectUniform()
{
    Seed ^= Seed << 13;
    Seed ^= Seed >> 17;
    Seed ^= Seed << 5;
    return static_cast<float>(Seed) / 4294967296.0f;
}

void PlumeSourceProjection::WriteSource(PlumeVec3 Position, float Radius, PlumeVec3 Velocity,
                                        float Smoke, float Heat, float Flame, float Soot)
{
    if (Count >= SourceCapacity || (Smoke <= 0.0f && Heat <= 0.0f && Flame <= 0.0f && Soot <= 0.0f))
        return;
    const int Offset = Count * SourceStride;
    Records[Offset + 0] = Position.X;
    Records[Offset + 1] = Position.Y;
    Records[Offset + 2] = Position.Z;
    Records[Offset + 3] = Radius;
    Records[Offset + 4] = Velocity.X;
    Records[Offset + 5] = Velocity.Y;
    Records[Offset + 6] = Velocity.Z;
    Records[Offset + 7] = 0.0f;
    Records[Offset + 8] = Smoke;
    Records[Offset + 9] = Heat;
    Records[Offset + 10] = Flame;
    Records[Offset + 11] = Soot;
    ++Count;
}

bool PlumeSourceProjection::AdvanceOnset(SourceOnset& Onset, float Power, float SlipSpeed, bool Contact, float Seconds)
{
    const SmokeSpecificationValues Specification = QuerySmokeSpecification();
    if (!Contact || !(Seconds > 0.0f))
    {
        Onset = {};
        return false;
    }
    const bool AboveEntry = Power > Specification.SourcePowerOnset && SlipSpeed >= Specification.MinimumSlipSpeed;
    const bool AboveRelease = Power > Specification.SourcePowerOnset * Specification.SourceReleaseRatio
                           && SlipSpeed >= Specification.MinimumSlipSpeed;
    if (AboveEntry)
    {
        Onset.RequestSeconds += Seconds;
        Onset.QuietSeconds = 0.0f;
        if (Onset.RequestSeconds + 1.0e-6f >= Specification.SourceOnsetSeconds)
            Onset.Active = true;
    }
    else if (Onset.Active && AboveRelease)
        Onset.QuietSeconds = 0.0f;
    else
    {
        Onset.RequestSeconds = 0.0f;
        Onset.QuietSeconds += Seconds;
        if (Onset.QuietSeconds >= Specification.SourceReleaseSeconds)
            Onset.Active = false;
    }
    return Onset.Active;
}

int PlumeSourceProjection::Project(const PlumeTelemetry& Telemetry, float Seconds, const SourceProjectOptions& Options)
{
    const SmokeSpecificationValues Specification = QuerySmokeSpecification();
    const float Rate = Options.EmissionRate;
    const float SmokeYield = Options.SmokeYield * Rate;
    const float HeatYield = Options.HeatYield * Rate;
    const float SootYield = Options.SootYield * Rate;
    Count = 0;
    ActiveTyres = 0;
    Lights.clear();
    Elapsed += Seconds;

    for (size_t Index = 0; Index < Telemetry.Wheels.size() && Index < 4; ++Index)
    {
        const WheelTelemetry& Wheel = Telemetry.Wheels[Index];
        const bool Burning = Wheel.Ignited && Wheel.CombustionPower > 0.0f;
        const bool Sliding = AdvanceOnset(Onsets[Index], Wheel.SlidingPower, Wheel.SlipSpeed, Wheel.InContact, Seconds);
        if (!Sliding && !Burning)
            continue;
        ++ActiveTyres;
        const PlumeVec3 Anchor = Burning && !Wheel.InContact ? Wheel.HubPosition : Wheel.ContactPoint;
        const PlumeVec3 Position = { Anchor.X, Anchor.Y, Anchor.Z + 0.04f };
        const float Strength = Sliding ? std::min(4.0f, std::max(0.0f, (Wheel.SlidingPower - Specification.SourcePowerOnset)
            / std::max(1.0f, Specification.SourcePowerFull - Specification.SourcePowerOnset))) : 0.0f;
        const float Warm = std::min(1.0f, std::max(0.0f, (Wheel.SurfaceTemperature - WarmBase) / WarmSpan));
        const float Smoke = Specification.DensityRate * Strength * (0.35f + 0.65f * Warm) * (Wheel.Burst ? 0.25f : 1.0f);
        const float LongitudinalSpeed = Wheel.ContactVelocity.X * Wheel.Longitudinal.X
                                      + Wheel.ContactVelocity.Y * Wheel.Longitudinal.Y
                                      + Wheel.ContactVelocity.Z * Wheel.Longitudinal.Z;
        const float SurfaceSlip = Wheel.SurfaceSpeed - LongitudinalSpeed;
        const float Fling = std::clamp(FlingShare * SurfaceSlip, -FlingCeiling, FlingCeiling);
        const PlumeVec3 Heading = Wheel.Longitudinal;
        const PlumeVec3 Thrown = Wheel.ContactVelocity * Specification.CarrierVelocityShare + Heading * (-Fling);
        WriteSource(Position, Specification.PatchRadius * 1.4f, Thrown + PlumeVec3{ 0.0f, 0.0f, 0.35f },
                    Smoke * SmokeYield, Specification.SmokeHeatRate * Strength * HeatYield, 0.0f, 0.0f);
        if (Sliding && std::fabs(Fling) > 1.0f && Wheel.Radius > 0.0f)
        {
            const float Sign = Fling >= 0.0f ? 1.0f : -1.0f;
            const PlumeVec3 Back = Heading * (-Sign);
            const PlumeVec3 Arch = Wheel.HubPosition + Back * (Wheel.Radius * 0.85f) + PlumeVec3{ 0.0f, 0.0f, Wheel.Radius * 0.35f };
            WriteSource(Arch, 0.28f, Back * (0.45f * std::fabs(Fling)) + PlumeVec3{ 0.0f, 0.0f, 1.0f },
                        ArchShare * Smoke * SmokeYield, 0.0f, 0.0f, 0.0f);
        }
        if (Burning)
        {
            const PlumeVec3 Outward = PlumeVec3{ -Heading.Y, Heading.X, 0.0f } * ((Index & 1) ? -1.0f : 1.0f);
            const float Radius = Wheel.Radius > 0.0f ? Wheel.Radius : 0.5f;
            const PlumeVec3 Sidewall = Wheel.HubPosition + Outward * FlameSidewallReach + PlumeVec3{ 0.0f, 0.0f, -0.3f * Radius };
            const PlumeVec3 Trailing = Wheel.HubPosition + Heading * -(Radius + 0.12f) + PlumeVec3{ 0.0f, 0.0f, -0.15f * Radius };
            const PlumeVec3 Carried = Wheel.ContactVelocity * Specification.CarrierVelocityShare;
            const float Heat = Wheel.CombustionPower * Specification.FireHeatPowerScale * HeatYield;
            WriteSource(Sidewall, 0.3f, Carried + Outward * 0.4f + PlumeVec3{ 0.0f, 0.0f, FlameRise },
                        0.6f * SmokeYield, 0.6f * Heat, 7.0f * Rate, 8.0f * SootYield);
            WriteSource(Trailing, 0.28f, Carried + PlumeVec3{ 0.0f, 0.0f, FlameRise },
                        0.4f * SmokeYield, 0.4f * Heat, 5.0f * Rate, 6.0f * SootYield);
            const float Flicker = 0.78f + 0.22f * std::sin(Elapsed * 17.0f + static_cast<float>(Index) * 2.1f)
                                        * std::sin(Elapsed * 6.3f + static_cast<float>(Index));
            const float Intensity = Wheel.CombustionPower * FireLightGain * Options.FireLight * Flicker;
            FireLight Light{};
            Light.Position = Sidewall + PlumeVec3{ 0.0f, 0.0f, 0.45f };
            Light.Radius = 0.4f;
            Light.Radiance = { FireColour[0] * Intensity, FireColour[1] * Intensity, FireColour[2] * Intensity };
            Lights.push_back(Light);
        }
    }

    for (size_t Tip = 0; Tip < Telemetry.Exhausts.size() && Tip < 2; ++Tip)
    {
        PopSeconds[Tip] = std::max(0.0f, PopSeconds[Tip] - Seconds);
        if (Options.Afterfire && Telemetry.AfterfireSeconds > 0.0f && PopSeconds[Tip] <= 0.0f && ProjectUniform() < Seconds * 14.0f)
        {
            PopSeconds[Tip] = 0.035f + 0.055f * ProjectUniform();
            PopStrength[Tip] = 0.6f + 0.8f * ProjectUniform();
        }
        if (PopSeconds[Tip] <= 0.0f)
            continue;
        const ExhaustTelemetry& Exhaust = Telemetry.Exhausts[Tip];
        const float Strength = PopStrength[Tip];
        const float Speed = 8.0f + 6.0f * Strength;
        const PlumeVec3 Velocity = Telemetry.Velocity * 0.7f + Exhaust.Direction * Speed;
        const PlumeVec3 Nozzle = Exhaust.Position + Exhaust.Direction * 0.15f;
        WriteSource(Nozzle, 0.1f, Velocity, 1.0f * Strength * SmokeYield, 260.0f * Strength * HeatYield,
                    40.0f * Strength * Rate, 1.2f * Strength * SootYield);
        FireLight Light{};
        Light.Position = Nozzle + Exhaust.Direction * 0.3f;
        Light.Radius = 0.25f;
        const float Gain = 9.0f * Strength * Options.FireLight;
        Light.Radiance = { 1.0f * Gain, 0.55f * Gain, 0.2f * Gain };
        Lights.push_back(Light);
    }

    std::sort(Lights.begin(), Lights.end(), [](const FireLight& Left, const FireLight& Right)
    {
        return (Right.Radiance.X + Right.Radiance.Y) < (Left.Radiance.X + Left.Radiance.Y);
    });
    return Count;
}

void PlumeSourceProjection::WriteExtra(const PlumeEmission& Emission)
{
    if (!Emission.Active || Count >= SourceCapacity)
        return;
    WriteSource(Emission.Position, Emission.Radius > 0.0f ? Emission.Radius : 0.3f, Emission.Velocity,
                Emission.SmokeRate, Emission.HeatRate, Emission.FlameRate, Emission.SootRate);
}

std::array<float, 6> PlumeSourceProjection::ResolveBounds() const
{
    std::array<float, 6> Bounds = { 1e30f, 1e30f, 1e30f, -1e30f, -1e30f, -1e30f };
    for (int Index = 0; Index < Count; ++Index)
    {
        const int Offset = Index * SourceStride;
        const float Reach = std::max(Records[Offset + 3], 0.3f) * 3.5f;
        Bounds[0] = std::min(Bounds[0], Records[Offset + 0] - Reach);
        Bounds[1] = std::min(Bounds[1], Records[Offset + 1] - Reach);
        Bounds[2] = std::min(Bounds[2], Records[Offset + 2] - Reach);
        Bounds[3] = std::max(Bounds[3], Records[Offset + 0] + Reach);
        Bounds[4] = std::max(Bounds[4], Records[Offset + 1] + Reach);
        Bounds[5] = std::max(Bounds[5], Records[Offset + 2] + Reach);
    }
    return Bounds;
}

PlumeEmission ResolveTestPlume(PlumeVec3 VehiclePosition, PlumeVec3 Forward, bool Burning) noexcept
{
    const PlumeVec3 Point = { VehiclePosition.X + 3.0f * Forward.X, VehiclePosition.Y + 3.0f * Forward.Y, 0.05f };
    PlumeEmission Emission{};
    Emission.Active = true;
    Emission.Position = Burning ? PlumeVec3{ Point.X, Point.Y, 0.25f } : Point;
    Emission.Radius = Burning ? 0.45f : 0.35f;
    Emission.SmokeRate = Burning ? 0.0f : 26.0f;
    Emission.SootRate = 0.0f;
    Emission.FlameRate = Burning ? 12.0f : 0.0f;
    Emission.HeatRate = Burning ? 39.0f : 1.2f;
    Emission.Velocity = { 0.0f, 0.0f, Burning ? 1.2f : 0.35f };
    return Emission;
}

} // namespace Frontier
