/*==========================================================================================================================================
                                                          DISTANCEFIELDINSPECTOR.H
==========================================================================================================================================*/
// 🧩 DistanceFieldConfiguration: the signed distance clipmap cascades.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    DISTANCE FIELD INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class DistanceFieldInspector final : public RecordInspector
{
  public:
    explicit DistanceFieldInspector(DistanceFieldConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "RENDER · DISTANCE FIELD"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "4-cascade clipmap"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    DistanceFieldConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
