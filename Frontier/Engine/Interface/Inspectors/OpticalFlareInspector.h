/*==========================================================================================================================================
                                                          OPTICALFLAREINSPECTOR.H
==========================================================================================================================================*/
// 🧩 OpticalFlareConfiguration: the aperture lens flare.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    OPTICAL FLARE INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class OpticalFlareInspector final : public RecordInspector
{
  public:
    explicit OpticalFlareInspector(OpticalFlareConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "ENVIRONMENT · OPTICAL FLARE"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "Aperture diffraction"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    OpticalFlareConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
