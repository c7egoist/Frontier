/*==========================================================================================================================================
                                                    FLUIDSIMULATIONSEQUENCE.H
==========================================================================================================================================*/
// 🧩 Stable CPU advection, buoyancy, incompressible pressure projection, field coupling, and particle-trigger sampling.

#pragma once

#include "Engine/PhysicalDynamics/IFieldSampler.h"
#include "Engine/PhysicalDynamics/FluidDynamics/FluidSpace.h"
#include "Engine/PhysicalDynamics/ParticleDynamics/ParticleTriggerRouter.h"

#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{

class FluidSimulationSequence
{
  public:
    [[nodiscard]] bool Advance(FluidSpace& Space, double DeltaSeconds, const IFieldSampler* FieldSampler = nullptr,
                               std::string* OutDiagnostic = nullptr) const;

    [[nodiscard]] std::vector<FluidBurstTriggerEvent> CollectBurstTriggers(const FluidSpace& Space,
                                                                           double              MinimumThermalIntensity = 0.25,
                                                                           double              MinimumVaporDensity = 0.02,
                                                                           double              MinimumSmokeDensity = 0.02) const;

  private:
    static void Advect(FluidSpace& Space, double DeltaSeconds);
    static void ProjectDivergence(FluidSpace& Space, double DeltaSeconds);
};

} // namespace Frontier
