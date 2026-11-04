/*==========================================================================================================================================
                                                   FORCED INDUCTION MODEL
                                     ------------------------------------------------------------------
                     Manifold pressure dynamics: lag, anti-lag and compound behaviour. Time-based.
==========================================================================================================================================*/

// 🧩 Forced induction model: manifold pressure dynamics with lag, anti-lag and compound behaviour.

#pragma once

#include "Engine/Audio/VehicleAudioSpecification.h"

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                              FORCED INDUCTION STATE
//------------------------------------------------------------------------------------------------------------------------

struct ForcedInductionState
{
    float BoostBar  = 0;   // [bar] - manifold pressure above ambient
    float TurboRpm  = 18000; // [rev/min] - shaft speed for whine synthesis
    float InferredRotorHz = 0; // [Hz] - SC rotor lobe whine = crankHz * ratio * lobes
};

//------------------------------------------------------------------------------------------------------------------------
//                                              FORCED INDUCTION MODEL
//------------------------------------------------------------------------------------------------------------------------

class ForcedInductionModel
{
  public:
    explicit ForcedInductionModel(const VehicleAudioSpecification* Spec = nullptr) noexcept;

    void Attach(const VehicleAudioSpecification* Spec) noexcept;
    void Reset() noexcept;

    // Fixed-step update driven by wall clock, not frames. Rpm and throttle are filtered upstream.
    void Advance(float Rpm, float Throttle01, float Δτ, ForcedInductionState& Out) noexcept;

    [[nodiscard]] const ForcedInductionState& QueryState() const noexcept { return State; }

  private:
    const VehicleAudioSpecification* BoundSpec = nullptr;
    ForcedInductionState             State;
    float                            TargetBoostBar = 0; // [bar]
};

} // namespace Frontier
