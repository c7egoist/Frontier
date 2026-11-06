/*==========================================================================================================================================
                                                         PLUMESOURCEPROJECTION.CPP
==========================================================================================================================================*/
// 🧩 1:1 C++ port of PlumeSourceProjection.js — see the header for the provenance.

#include "PlumeSourceProjection.h"

#include <algorithm>
#include <cmath>

namespace FluidSmoke
{

PlumeSourceProjection::PlumeSourceProjection() = default;

void PlumeSourceProjection::Reset() noexcept
{
    for (auto& Onset : Onsets)
        Onset = OnsetState{};
    PopSeconds = { 0.0f, 0.0f };
    PopStrength = { 0.0f, 0.0f };
    Bursts.clear();
}

float PlumeSourceProjection::ProjectUniform() noexcept
{
    Seed ^= Seed << 13;
    Seed ^= Seed >> 17;
    Seed ^= Seed << 5;
    return static_cast<float>(Seed) / 4294967296.0f;
}

void PlumeSourceProjection::QueueBurst(const BurstRequest& Burst)
{
    Bursts.push_back(Burst);
    // 📝 Remaining time is tracked beside the burst in a parallel vector (Burst.Remaining in the exhibit).
    RemainingTimes.push_back(Burst.Seconds);
    if (Bursts.size() > 4)
    {
        Bursts.erase(Bursts.begin());
        RemainingTimes.erase(RemainingTimes.begin());
    }
}

bool PlumeSourceProjection::AdvanceOnset(OnsetState& Onset, float Power, float SlipSpeed, bool Contact, float Seconds) noexcept
{
    const SmokeSpecificationT& Specification = SmokeSpecification;
    if (!Contact || !(Seconds > 0.0f))
    {
        Onset = OnsetState{};
        return false;
    }
    const bool AboveEntry   = Power > Specification.SourcePowerOnset && SlipSpeed >= Specification.MinimumSlipSpeed;
    const bool AboveRelease = Power > Specification.SourcePowerOnset * Specification.SourceReleaseRatio && SlipSpeed >= Specification.MinimumSlipSpeed;
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

int PlumeSourceProjection::Project(const PlumeTelemetry& Telemetry, float Seconds, const SourceOptions& Options)
{
    const SmokeSpecificationT& Specification = SmokeSpecification;
    const float Rate = Options.EmissionRate;
    const float SmokeYield = Options.SmokeYield * Rate, HeatYield = Options.HeatYield * Rate;
    const float SootYield = Options.SootYield * Rate;
    Count = 0;
    ActiveTyres = 0;
    Lights.clear();
    Embers.clear();
    Elapsed += Seconds;

    const auto Emit = [&](const Vec3& Position, float Radius, const Vec3& Velocity, float Smoke, float Heat, float Flame, float Soot)
    {
        if (Count >= SourceCapacity || (Smoke <= 0.0f && Heat <= 0.0f && Flame <= 0.0f && Soot <= 0.0f))
            return;
        float* R = &Records[Count * SourceStride];
        R[0] = Position[0]; R[1] = Position[1]; R[2] = Position[2]; R[3] = Radius;
        R[4] = Velocity[0]; R[5] = Velocity[1]; R[6] = Velocity[2]; R[7] = 0.0f;
        R[8] = Smoke; R[9] = Heat; R[10] = Flame; R[11] = Soot;
        Count++;
    };

    // ① tyres — ResolveWheelSmoke(), thrown along the tread's slip, shed again from the arch
    for (size_t Index = 0; Index < Telemetry.Wheels.size() && Index < 4; ++Index)
    {
        const WheelTelemetry& Wheel = Telemetry.Wheels[Index];
        const WheelThermal& Thermal = Wheel.Thermal;
        const bool Burning = Thermal.Ignited && Thermal.CombustionPower > 0.0f;
        const float Power = Wheel.SlidingPower;
        const bool Sliding = AdvanceOnset(Onsets[Index], Power, Wheel.SlipSpeed, Wheel.ContactFraction > 0.5f && !Wheel.OnDebris, Seconds);
        if (!Sliding && !Burning)
            continue;
        ActiveTyres++;
        const Vec3& Anchor = (Burning && Wheel.ContactFraction <= 0.5f) ? Wheel.HubPosition : Wheel.ContactPoint;
        const Vec3 Position = { Anchor[0], Anchor[1], Anchor[2] + 0.04f };
        const float Strength = Sliding ? std::min(4.0f, std::max(0.0f, (Power - Specification.SourcePowerOnset)
            / std::max(1.0f, Specification.SourcePowerFull - Specification.SourcePowerOnset))) : 0.0f;
        const float Warm = std::min(1.0f, std::max(0.0f, (Thermal.Surface - WarmBase) / WarmSpan));
        const float Smoke = Specification.DensityRate * Strength * (0.35f + 0.65f * Warm) * (Wheel.Burst ? 0.25f : 1.0f);
        // 📝 The tread at the patch moves at (surface speed − ground speed) along the wheel's heading; smoke leaves
        //    with a share of that, rearward of a tyre spinning forward, plus a little lift.
        const float GroundSpeed = Dot(Wheel.ContactVelocity, Wheel.Longitudinal);
        const float SurfaceSlip = Wheel.SurfaceSpeed - GroundSpeed;
        const float Fling = std::clamp(FlingShare * SurfaceSlip, -FlingCeiling, FlingCeiling);
        const Vec3 Heading = Wheel.Longitudinal;
        const Vec3 Thrown = MultiplyAddVector(ScaleVector(Wheel.ContactVelocity, Specification.CarrierVelocityShare), Heading, -Fling);
        Emit(Position, Specification.PatchRadius * 1.4f, AddVector(Thrown, { 0.0f, 0.0f, 0.35f }), Smoke * SmokeYield,
             Specification.SmokeHeatRate * Strength * HeatYield, 0.0f, 0.0f);
        if (Sliding && std::abs(Fling) > 1.0f && Wheel.Radius > 0.0f)
        {
            const Vec3 Back = ScaleVector(Heading, -std::copysign(1.0f, Fling));
            const Vec3 Arch = AddVector(AddVector(Wheel.HubPosition, ScaleVector(Back, Wheel.Radius * 0.85f)),
                                        { 0.0f, 0.0f, Wheel.Radius * 0.35f });
            Emit(Arch, 0.28f, AddVector(ScaleVector(Back, 0.45f * std::abs(Fling)), { 0.0f, 0.0f, 1.0f }),
                 ArchShare * Smoke * SmokeYield, 0.0f, 0.0f, 0.0f);
        }
        // 📝 Burning rubber: two flame seats per tyre shed incandescence and black soot in place of white smoke.
        if (Burning)
        {
            const Vec3 Outward = ScaleVector({ -Heading[1], Heading[0], 0.0f }, (Index & 1) ? -1.0f : 1.0f);
            const float Radius = Wheel.Radius > 0.0f ? Wheel.Radius : 0.5f;
            const Vec3 Sidewall = AddVector(MultiplyAddVector(Wheel.HubPosition, Outward, FlameSidewallReach), { 0.0f, 0.0f, -0.3f * Radius });
            const Vec3 Trailing = AddVector(MultiplyAddVector(Wheel.HubPosition, Heading, -(Radius + 0.12f)), { 0.0f, 0.0f, -0.15f * Radius });
            const Vec3 Carried = ScaleVector(Wheel.ContactVelocity, Specification.CarrierVelocityShare);
            const float Heat = Thermal.CombustionPower * Specification.FireHeatPowerScale * HeatYield;
            Emit(Sidewall, 0.3f, AddVector(MultiplyAddVector(Carried, Outward, 0.4f), { 0.0f, 0.0f, FlameRise }), 0.6f * SmokeYield, 0.6f * Heat,
                 7.0f * Rate, 8.0f * SootYield);
            Emit(Trailing, 0.28f, AddVector(Carried, { 0.0f, 0.0f, FlameRise }), 0.4f * SmokeYield, 0.4f * Heat, 5.0f * Rate, 6.0f * SootYield);
            const Vec3 Flank = Sidewall;
            const float Flicker = 0.78f + 0.22f * std::sin(Elapsed * 17.0f + static_cast<float>(Index) * 2.1f)
                                        * std::sin(Elapsed * 6.3f + static_cast<float>(Index));
            const float Intensity = Thermal.CombustionPower * FireLightGain * Options.FireLight * Flicker;
            Lights.push_back({ AddVector(Flank, { 0.0f, 0.0f, 0.45f }), 0.4f, ScaleVector(FireColour, Intensity) });
            Embers.push_back({ Flank, AddVector(ScaleVector(Wheel.ContactVelocity, 0.3f), { 0.0f, 0.0f, 2.2f }),
                               55.0f * Options.Embers, 1350.0f, 0.9f, 2.5f, 0.15f, 1.6f });
        }
    }

    // ② exhaust afterfire: while the window is open each tip fires 35–90 ms bursts with random gaps
    Popping = false;
    for (size_t Tip = 0; Tip < Telemetry.Exhausts.size() && Tip < 2; ++Tip)
    {
        PopSeconds[Tip] = std::max(0.0f, PopSeconds[Tip] - Seconds);
        if (Options.Afterfire && Telemetry.AfterfireSeconds > 0.0f && PopSeconds[Tip] <= 0.0f && ProjectUniform() < Seconds * 14.0f)
        {
            PopSeconds[Tip]  = 0.035f + 0.055f * ProjectUniform();
            PopStrength[Tip] = 0.6f + 0.8f * ProjectUniform();
        }
        if (PopSeconds[Tip] <= 0.0f)
            continue;
        Popping = true;
        const ExhaustTelemetry& Exhaust = Telemetry.Exhausts[Tip];
        const float Strength = PopStrength[Tip];
        const float Speed = 8.0f + 6.0f * Strength;
        const Vec3 Velocity = MultiplyAddVector(ScaleVector(Telemetry.Velocity, 0.7f), Exhaust.Direction, Speed);
        const Vec3 Nozzle = MultiplyAddVector(Exhaust.Position, Exhaust.Direction, 0.15f);
        Emit(Nozzle, 0.1f, Velocity, 1.0f * Strength * SmokeYield, 260.0f * Strength * HeatYield, 40.0f * Strength * Rate, 1.2f * Strength * SootYield);
        Lights.push_back({ MultiplyAddVector(Nozzle, Exhaust.Direction, 0.3f), 0.25f,
                           ScaleVector({ 1.0f, 0.55f, 0.2f }, 9.0f * Strength * Options.FireLight) });
        Embers.push_back({ Nozzle, Velocity, 260.0f * Strength * Options.Embers, 1700.0f, 1.6f, 0.4f, 0.6f, 0.35f });
    }

    // ③ transient bursts until their time is spent
    for (size_t B = 0; B < Bursts.size(); ++B)
    {
        BurstRequest& Burst = Bursts[B];
        const float Share = std::min(1.0f, RemainingTimes[B] / std::max(Burst.Seconds, 1.0e-3f));
        Emit(Burst.Position, Burst.Radius, Burst.Velocity, Burst.Smoke * Share * Rate, Burst.Heat * Share * HeatYield,
             Burst.Flame * Share * Rate, Burst.Soot * Share * SootYield);
        RemainingTimes[B] -= Seconds;
    }
    for (size_t B = Bursts.size(); B-- > 0;)
        if (RemainingTimes[B] <= 0.0f)
        {
            Bursts.erase(Bursts.begin() + static_cast<long>(B));
            RemainingTimes.erase(RemainingTimes.begin() + static_cast<long>(B));
        }
    std::sort(Lights.begin(), Lights.end(), [](const FireLight& L, const FireLight& R)
        { return (R.Radiance[0] + R.Radiance[1]) > (L.Radiance[0] + L.Radiance[1]); });
    return Count;
}

SourceBounds PlumeSourceProjection::ResolveBounds() const noexcept
{
    SourceBounds Bounds;
    Bounds.Minimum = { std::numeric_limits<float>::infinity(), std::numeric_limits<float>::infinity(), std::numeric_limits<float>::infinity() };
    Bounds.Maximum = { -std::numeric_limits<float>::infinity(), -std::numeric_limits<float>::infinity(), -std::numeric_limits<float>::infinity() };
    for (int Index = 0; Index < Count; ++Index)
    {
        const float* R = &Records[Index * SourceStride];
        const float Reach = std::max(R[3], 0.3f) * 3.5f;
        for (int Axis = 0; Axis < 3; ++Axis)
        {
            Bounds.Minimum[Axis] = std::min(Bounds.Minimum[Axis], R[Axis] - Reach);
            Bounds.Maximum[Axis] = std::max(Bounds.Maximum[Axis], R[Axis] + Reach);
        }
    }
    return Bounds;
}

} // namespace FluidSmoke
