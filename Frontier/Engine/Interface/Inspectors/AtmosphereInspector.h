/*==========================================================================================================================================
                                                           ATMOSPHEREINSPECTOR.H
==========================================================================================================================================*/
// 🧩 AtmosphereConfiguration: Rayleigh, Mie and ozone scattering.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    ATMOSPHERE INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class AtmosphereInspector final : public RecordInspector
{
  public:
    explicit AtmosphereInspector(AtmosphereConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "ENVIRONMENT · ATMOSPHERE"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "Rayleigh + Mie + O3"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    AtmosphereConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
