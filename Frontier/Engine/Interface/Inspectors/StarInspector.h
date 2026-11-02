/*==========================================================================================================================================
                                                              STARINSPECTOR.H
==========================================================================================================================================*/
// 🧩 StarConfiguration: the Hipparcos star field.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    STAR INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class StarInspector final : public RecordInspector
{
  public:
    explicit StarInspector(StarConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "ENVIRONMENT · STARS"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "Hipparcos J2000 catalogue"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      ConstructInspector() override;

  private:
    StarConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
