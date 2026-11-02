/*==========================================================================================================================================
                                                           SURFACECARDINSPECTOR.H
==========================================================================================================================================*/
// 🧩 SurfaceCardConfiguration: the surface card atlas and its radiosity budget.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    SURFACE CARD INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class SurfaceCardInspector final : public RecordInspector
{
  public:
    explicit SurfaceCardInspector(SurfaceCardConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "RENDER · SURFACE CARDS"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "Multi-bounce radiance"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    SurfaceCardConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
