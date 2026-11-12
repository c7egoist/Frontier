/*============================================================================================================================================
                                                          FORCEFIELDACCUMULATOR.CPP
============================================================================================================================================*/
// 🧩 Fixed-step ForceFieldAccumulator evaluating active ForceSources, curl/divergence telemetry, and JoltPhysics rigid-body coupling

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/SimulationSpace/ForceFields/ForceFieldAccumulator.h"
#include "Engine/Constants/PhysicsConstants.h"
#include "Engine/SimulationSpace/ForceFields/FlowField.h"
#include "Engine/SimulationSpace/ForceFields/ForceMotionPath.h"
#include "Engine/SimulationSpace/ForceFields/TurbulenceField.h"
#include "Engine/SimulationSpace/ForceFields/VectorField.h"

#if defined(FRONTIER_HAS_JOLT_PHYSICS)
    #include <Jolt/Jolt.h>
    #include <Jolt/Physics/Body/BodyID.h>
    #include <Jolt/Physics/Body/BodyInterface.h>
#endif

#include <algorithm>
#include <cmath>

namespace Frontier::SimulationSpace::ForceFields
{

namespace
{

[[nodiscard]] uint32_t ComputeBeaufortScale(float SpeedMetersPerSecond) noexcept
{
    static constexpr float Thresholds[12] = {
        0.5f, 1.5f, 3.3f, 5.5f, 7.9f, 10.7f, 13.8f, 17.1f, 20.7f, 24.4f, 28.4f, 32.6f
    };
    for (uint32_t Index = 0u; Index < 12u; ++Index)
    {
        if (SpeedMetersPerSecond < Thresholds[Index])
        {
            return Index;
        }
    }
    return 12u;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                        SOURCE REGISTRATION & FORMULA COMPILATION
//------------------------------------------------------------------------------------------------------------------------

void ForceFieldAccumulator::AssignSources(std::span<const ForceSourceRecordEntry> Sources)
{
    ActiveSources.assign(Sources.begin(), Sources.end());
    CompiledFormulas.clear();
    for (const ForceSourceRecordEntry& Entry : ActiveSources)
    {
        if (Entry.FormulaEnabled && !Entry.FormulaSourceText.empty())
        {
            EnsureFormulaCompiled(Entry);
        }
    }
}

void ForceFieldAccumulator::EnsureFormulaCompiled(const ForceSourceRecordEntry& Entry)
{
    for (CompiledSlotEntry& Existing : CompiledFormulas)
    {
        if (Existing.UniqueToken == Entry.UniqueToken)
        {
            if (Existing.SourceHash != Entry.FormulaSourceText)
            {
                const FormulaCompileOutcome Outcome = CompileFieldFormula(Entry.FormulaSourceText);
                Existing.SourceHash                 = Entry.FormulaSourceText;
                Existing.Program                    = Outcome.Compiled ? Outcome.Program : FormulaBytecodeProgram{};
            }
            return;
        }
    }

    const FormulaCompileOutcome Outcome = CompileFieldFormula(Entry.FormulaSourceText);
    CompiledSlotEntry           Slot{};
    Slot.UniqueToken = Entry.UniqueToken;
    Slot.SourceHash  = Entry.FormulaSourceText;
    Slot.Program     = Outcome.Compiled ? Outcome.Program : FormulaBytecodeProgram{};
    CompiledFormulas.push_back(std::move(Slot));
}

void ForceFieldAccumulator::StepAnimation(double TimeSeconds, bool AdvanceMotion) noexcept
{
    StepAnimatedForceSources(ActiveSources, TimeSeconds, AdvanceMotion);
}

void ForceFieldAccumulator::TriggerImpulse(uint32_t UniqueToken, double TimeSeconds) noexcept
{
    for (ForceSourceRecordEntry& Entry : ActiveSources)
    {
        if (Entry.UniqueToken == UniqueToken)
        {
            Entry.DurationMode          = ForceDurationMode::Impulse;
            Entry.ImpulseTriggerTimeSec = static_cast<float>(TimeSeconds);
        }
    }
}

std::span<const ForceSourceRecordEntry> ForceFieldAccumulator::QuerySources() const noexcept
{
    return ActiveSources;
}

std::span<ForceSourceRecordEntry> ForceFieldAccumulator::AccessSources() noexcept
{
    return ActiveSources;
}

uint32_t ForceFieldAccumulator::QueryActiveSourceCount() const noexcept
{
    bool HasSolo = false;
    for (const ForceSourceRecordEntry& Entry : ActiveSources)
    {
        if (Entry.Enabled && Entry.Solo)
        {
            HasSolo = true;
            break;
        }
    }

    uint32_t Count = 0u;
    for (const ForceSourceRecordEntry& Entry : ActiveSources)
    {
        if (Entry.Enabled && (!HasSolo || Entry.Solo))
        {
            ++Count;
        }
    }
    return Count;
}

//------------------------------------------------------------------------------------------------------------------------
//                                           SPATIAL FORCE EVALUATION & TELEMETRY
//------------------------------------------------------------------------------------------------------------------------

SpatialForceSample ForceFieldAccumulator::QueryForceFieldSample(
    const SpatialVector3& WorldPoint,
    const SpatialVector3& BodyVelocity,
    double                TimeSeconds) const noexcept
{
    bool HasSolo = false;
    for (const ForceSourceRecordEntry& Entry : ActiveSources)
    {
        if (Entry.Enabled && Entry.Solo)
        {
            HasSolo = true;
            break;
        }
    }

    SpatialForceSample Accumulated{};
    for (const ForceSourceRecordEntry& Entry : ActiveSources)
    {
        if (!Entry.Enabled || (HasSolo && !Entry.Solo))
        {
            continue;
        }

        if (Entry.FormulaEnabled && !Entry.FormulaSourceText.empty())
        {
            for (const CompiledSlotEntry& Slot : CompiledFormulas)
            {
                if (Slot.UniqueToken == Entry.UniqueToken && Slot.Program.InstructionCount > 0u)
                {
                    Accumulated.AdvectionVelocity += EvaluateCompiledFormula(Slot.Program, Entry, WorldPoint, BodyVelocity, TimeSeconds);
                    break;
                }
            }
            continue;
        }

        SpatialForceSample Partial{};
        switch (QueryDomainForModel(Entry.Model))
        {
            case ForceDomainCategory::FlowField:
                Partial = EvaluateFlowFieldLaw(Entry, WorldPoint, BodyVelocity, TimeSeconds);
                break;
            case ForceDomainCategory::TurbulenceField:
                Partial = EvaluateTurbulenceFieldLaw(Entry, WorldPoint, BodyVelocity, TimeSeconds);
                break;
            case ForceDomainCategory::VectorField:
            default:
                Partial = EvaluateVectorFieldLaw(Entry, WorldPoint, BodyVelocity, TimeSeconds);
                break;
        }

        Accumulated.AdvectionVelocity  += Partial.AdvectionVelocity;
        Accumulated.LinearAcceleration += Partial.LinearAcceleration;
        Accumulated.AngularTorque      += Partial.AngularTorque;
        Accumulated.DragDecayRate      += Partial.DragDecayRate;
    }

    return Accumulated;
}

ForceDiagnosticsReading ForceFieldAccumulator::QueryAnemometerDiagnostics(
    const SpatialVector3& WorldPoint,
    double                TimeSeconds) const noexcept
{
    ForceDiagnosticsReading Reading{};
    Reading.TotalForce       = QueryForceFieldSample(WorldPoint, {}, TimeSeconds);
    Reading.ActiveForceCount = QueryActiveSourceCount();

    constexpr float H       = 0.05f;
    constexpr float InvTwoH = 1.0f / (2.0f * H);

    auto CombinedVec = [&](float Dx, float Dy, float Dz) noexcept -> SpatialVector3
    {
        const SpatialForceSample S = QueryForceFieldSample({ WorldPoint.X + Dx, WorldPoint.Y + Dy, WorldPoint.Z + Dz, 0.0f }, {}, TimeSeconds);
        return S.AdvectionVelocity + S.LinearAcceleration;
    };

    const SpatialVector3 Xp = CombinedVec(H, 0.0f, 0.0f);
    const SpatialVector3 Xm = CombinedVec(-H, 0.0f, 0.0f);
    const SpatialVector3 Yp = CombinedVec(0.0f, H, 0.0f);
    const SpatialVector3 Ym = CombinedVec(0.0f, -H, 0.0f);
    const SpatialVector3 Zp = CombinedVec(0.0f, 0.0f, H);
    const SpatialVector3 Zm = CombinedVec(0.0f, 0.0f, -H);

    const float dVx_dx = (Xp.X - Xm.X) * InvTwoH;
    const float dVy_dx = (Xp.Y - Xm.Y) * InvTwoH;
    const float dVz_dx = (Xp.Z - Xm.Z) * InvTwoH;

    const float dVx_dy = (Yp.X - Ym.X) * InvTwoH;
    const float dVy_dy = (Yp.Y - Ym.Y) * InvTwoH;
    const float dVz_dy = (Yp.Z - Ym.Z) * InvTwoH;

    const float dVx_dz = (Zp.X - Zm.X) * InvTwoH;
    const float dVy_dz = (Zp.Y - Zm.Y) * InvTwoH;
    const float dVz_dz = (Zp.Z - Zm.Z) * InvTwoH;

    Reading.CurlVector    = { dVz_dy - dVy_dz, dVx_dz - dVz_dx, dVy_dx - dVx_dy, 0.0f };
    Reading.CurlMagnitude = VectorLength(Reading.CurlVector);
    Reading.Divergence    = dVx_dx + dVy_dy + dVz_dz;

    const SpatialVector3 WindVel  = Reading.TotalForce.AdvectionVelocity;
    const float          WindSq   = VectorLengthSquared(WindVel);
    const float          WindMag  = std::sqrt(WindSq);
    Reading.DynamicPressurePa     = 0.5f * static_cast<float>(Constants::DryAirDensity) * WindSq;
    Reading.BeaufortScale         = ComputeBeaufortScale(WindMag);

    float Azimuth = std::atan2(WindVel.Y, WindVel.X) * Constants::RadToDegFloat;
    if (Azimuth < 0.0f)
    {
        Azimuth += 360.0f;
    }
    Reading.CompassAzimuthDeg = Azimuth;
    return Reading;
}

void ForceFieldAccumulator::ApplyForcesToJoltBody(
    JPH::BodyInterface& BodyAccess,
    JPH::BodyID         TargetBody,
    float               EffectiveAreaSqM,
    float               AerodynamicDragFactor,
    double              TimeSeconds) const noexcept
{
#if defined(FRONTIER_HAS_JOLT_PHYSICS)
    const JPH::RVec3 Pos = BodyAccess.GetCenterOfMassPosition(TargetBody);
    const JPH::Vec3  Vel = BodyAccess.GetLinearVelocity(TargetBody);

    const SpatialVector3 QueryPos{ static_cast<float>(Pos.GetX()), static_cast<float>(Pos.GetY()), static_cast<float>(Pos.GetZ()), 0.0f };
    const SpatialVector3 QueryVel{ Vel.GetX(), Vel.GetY(), Vel.GetZ(), 0.0f };
    const SpatialForceSample Sample = QueryForceFieldSample(QueryPos, QueryVel, TimeSeconds);

    // Aerodynamic relative flow drag: F_aero = 0.5 * rho_air * Cd * A * |v_rel| * v_rel
    const SpatialVector3 RelWind = Sample.AdvectionVelocity - QueryVel;
    const float          RelSpd  = VectorLength(RelWind);
    const float          AeroK   = 0.5f * static_cast<float>(Constants::DryAirDensity) *
                                   std::max(0.05f, AerodynamicDragFactor) * std::max(0.01f, EffectiveAreaSqM) * RelSpd;

    const float MassPropsApprox = 1.0f / std::max(1.0e-5f, BodyAccess.GetMotionQuality(TargetBody) == JPH::EMotionQuality::Discrete ? 1.0f : 1.0f);
    (void)MassPropsApprox;

    const SpatialVector3 DirectForce = Sample.LinearAcceleration * std::max(1.0f, EffectiveAreaSqM * 10.0f) + RelWind * AeroK;
    BodyAccess.AddForce(TargetBody, JPH::Vec3(DirectForce.X, DirectForce.Y, DirectForce.Z));

    if (VectorLengthSquared(Sample.AngularTorque) > 1.0e-6f)
    {
        BodyAccess.AddTorque(TargetBody, JPH::Vec3(Sample.AngularTorque.X, Sample.AngularTorque.Y, Sample.AngularTorque.Z));
    }
#else
    (void)BodyAccess;
    (void)TargetBody;
    (void)EffectiveAreaSqM;
    (void)AerodynamicDragFactor;
    (void)TimeSeconds;
#endif
}

} // namespace Frontier::SimulationSpace::ForceFields
