/*==========================================================================================================================================
                                                   FORCED INDUCTION MODEL — DYNAMICS
                                     ------------------------------------------------------------------
                              Lag and blow-off as first-order systems; compound twins switch dominance by rpm.
==========================================================================================================================================*/

// 🧩 Forced induction model dynamics: lag and blow-off as first-order systems with compound blending.

#include "Engine/Audio/ForcedInductionModel.h"

#include <algorithm>
#include <cmath>

namespace Frontier
{

ForcedInductionModel::ForcedInductionModel(const VehicleAudioSpecification* Spec) noexcept
    : BoundSpec(Spec)
{
    Reset();
}

void ForcedInductionModel::Attach(const VehicleAudioSpecification* Spec) noexcept
{
    BoundSpec = Spec;
    Reset();
}

void ForcedInductionModel::Reset() noexcept
{
    State.BoostBar = 0;
    State.TurboRpm = 18000;
    State.InferredRotorHz = 0;
    TargetBoostBar = 0;
}

void ForcedInductionModel::Advance(float Rpm, float Throttle01, float Δτ, ForcedInductionState& Out) noexcept
{
    if (BoundSpec == nullptr)
    {
        Out = State;
        return;
    }

    const auto& Ind = BoundSpec->Induction;
    if (Ind.Kind == InductionKind::NaturallyAspirated || Ind.Kind == InductionKind::ElectricDrive)
    {
        State.BoostBar = 0;
        State.TurboRpm = 18000;
        State.InferredRotorHz = 0;
        Out = State;
        return;
    }

    if (Ind.Kind == InductionKind::Supercharged)
    {
        const float RpmFrac = std::max(0.0f, (Rpm - 1100.0f) / std::max(1.0f, BoundSpec->RedlineRpm - 1100.0f));
        const float Target  = Ind.PeakBoostBar * std::pow(RpmFrac, 0.82f) * std::pow(std::clamp(Throttle01, 0.0f, 1.0f), 0.92f);
        const float Tau     = 0.085f; // [s] belt slack
        State.BoostBar += (Target - State.BoostBar) * (1.0f - std::exp(-Δτ / Tau));
        const float CrankHz = std::max(4.0f, Rpm / 60.0f);
        State.InferredRotorHz = CrankHz * Ind.SuperchargerRatio * static_cast<float>(Ind.RotorLobes);
        State.TurboRpm        = 12000.0f + Rpm * Ind.SuperchargerRatio * static_cast<float>(Ind.RotorLobes) * 1.15f;
        Out = State;
        return;
    }

    // Turbocharged or Twincharged — exhaust enthalpy drives the compressor
    const float RpmNorm = std::max(0.0f, (Rpm - 1900.0f) / std::max(1.0f, BoundSpec->RedlineRpm - 1900.0f));
    const float MapEff  = 0.40f + 0.60f * std::sin(std::min(1.0f, RpmNorm) * 3.1415926f * 0.55f);
    const float ExhFlow = (Rpm / 1000.0f) * std::pow(std::clamp(Throttle01, 0.0f, 1.0f), 0.95f) * (1.0f + State.BoostBar * 0.20f) * MapEff;

    float Target = 0;
    if (Throttle01 > 0.08f && Rpm > 1700.0f)
    {
        const float LoadFac = std::min(1.0f, ExhFlow / 14.0f);
        Target = Ind.PeakBoostBar * LoadFac * std::pow(Throttle01, 0.88f);
        if (Ind.Kind == InductionKind::Twincharged)
        {
            const float ScPart    = 0.55f * Ind.PeakBoostBar * std::pow(std::max(0.0f, (Rpm - 900.0f) / 3400.0f), 0.90f) * Throttle01;
            const float TurboPart = Target * 0.82f;
            Target = std::min(Ind.PeakBoostBar, ScPart * 0.55f + TurboPart * 0.95f);
        }
    }

    const float TauUp   = Ind.TurboLagTau > 0 ? Ind.TurboLagTau : 0.42f;
    const float TauDown = 0.11f; // [s] blow-off
    const float Tau     = (Target > State.BoostBar) ? TauUp : TauDown;
    State.BoostBar += (Target - State.BoostBar) * (1.0f - std::exp(-Δτ / Tau));

    if (Ind.AntiLag && Throttle01 < 0.06f && Rpm > 4200.0f)
    {
        const float Hold = 0.38f * Ind.PeakBoostBar * std::min(1.0f, (Rpm - 4200.0f) / 2500.0f);
        State.BoostBar = std::max(State.BoostBar, Hold);
    }

    const float BoostNorm = State.BoostBar / std::max(0.15f, Ind.PeakBoostBar);
    State.TurboRpm = 22000.0f + BoostNorm * (Ind.TurboMaxRpm - 22000.0f) + (Rpm / 1000.0f) * 420.0f;
    State.TurboRpm = std::clamp(State.TurboRpm, 18000.0f, Ind.TurboMaxRpm);

    if (Ind.Kind == InductionKind::Twincharged)
    {
        const float CrankHz = std::max(4.0f, Rpm / 60.0f);
        State.InferredRotorHz = CrankHz * Ind.SuperchargerRatio * static_cast<float>(Ind.RotorLobes);
    }
    else
    {
        State.InferredRotorHz = 0;
    }

    Out = State;
}

} // namespace Frontier
