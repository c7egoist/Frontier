//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/TyreModelRegistry.cpp — tyre model factory
//============================================================================================================================================
// Central factory for the modular tyre seam. Any component can build any tyre model by kind:
//   std::unique_ptr<TyreModel> Tyre = CreateTyreModel(TyreModelKind::XpbdSpring);
//   Tyre->AssignSpecification(parametersFromToml);
//   auto Outputs = Tyre->Step(inputs);
//
//    The Pacejka, XPBD spring and 3-D FEM models all implement the same TyreModel inputs/outputs, so a
//    component can swap models at build or run time without changing its force-application code.

#include "PacejkaTyreModel.h"
#include "TyreModel.h"
#include "TyreFEMSolver.h"
#include "XpbdTyreSpring.h"

#include <memory>
#include <utility>

namespace Frontier::Vehicle {

[[nodiscard]] std::unique_ptr<TyreModel> CreateTyreModel(TyreModelKind Kind) noexcept
{
    switch (Kind)
    {
        case TyreModelKind::Pacejka:   return std::make_unique<PacejkaTyreModel>();
        case TyreModelKind::XpbdSpring: return std::make_unique<XpbdTyreSpring>();
        case TyreModelKind::Fem3d:     return std::make_unique<TyreFEMSolver>();
    }
    return nullptr;
}

} // namespace Frontier::Vehicle
