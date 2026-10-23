//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/PacejkaTyreModel.h — Pacejka MF6.1 behind the modular TyreModel seam
//============================================================================================================================================
//
//    Adapter that presents the existing validated Pacejka Magic-Formula (PacejkaMagicFormula + TyreSlipDynamics)
//    as a TyreModel, so all three tyre models (Pacejka, XPBD spring, 3-D FEM) are interchangeable behind the
//    same component-agnostic seam. Pacejka remains the production default; nothing about its behaviour changes.
//
//    Pure C++/scalar: no Jolt, no vehicle solver. Any component can drive it through TyreModelInputs.

#pragma once

#include "PacejkaMagicFormula.h"
#include "TyreSlipDynamics.h"
#include "TyreModel.h"

namespace Frontier::Vehicle {

//------------------------------------------------------------------------------------------------------------------------
//                                         ADAPTER
//------------------------------------------------------------------------------------------------------------------------
class PacejkaTyreModel final : public TyreModel
{
public:
    PacejkaTyreModel() noexcept;

    void AssignSpecification(const std::vector<std::pair<std::string, float>>& Parameters) noexcept override;

    [[nodiscard]] TyreModelOutputs Step(const TyreModelInputs& Inputs) noexcept override;
    void Reset() noexcept override;

    [[nodiscard]] const PacejkaMagicFormula& QueryFormula() const noexcept { return Formula; }
    [[nodiscard]] const TyreSlipDynamics&    QuerySlipSolver() const noexcept { return Slip; }

private:
    PacejkaMagicFormula Formula{};       // MF6.1 force evaluator
    TyreSlipDynamics    Slip{Formula};   // transient slip integrator (holds const ref to Formula)
    SlipState           State{};         // persistent per-tyre slip state (relaxation solver)
    float               EffectiveRadius = 0.0f; // [m] <= 0 ⇒ Tyre::Radius
};

} // namespace Frontier::Vehicle
