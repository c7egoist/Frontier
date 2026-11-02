/*==========================================================================================================================================
                                                              WINDINSPECTOR.H
==========================================================================================================================================*/
// 🧩 WindConfiguration: the shared weather force field.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    WIND INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class WindInspector final : public RecordInspector
{
  public:
    explicit WindInspector(WindConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "ENVIRONMENT · WIND FIELD"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "3D curl-noise advection"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    WindConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
