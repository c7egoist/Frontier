/*==========================================================================================================================================
                                                              MOONINSPECTOR.H
==========================================================================================================================================*/
// 🧩 MoonConfiguration: the scene moons.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

#include <string>

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    MOON INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class MoonInspector final : public RecordInspector
{
  public:
    explicit MoonInspector(MoonConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "ENVIRONMENT · MOONS"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "Dual-body orbital albedo"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;
    // 📝 The demo's Moons entity: Meta "<lit bodies>/4".
    [[nodiscard]] std::string QueryDirectoryReadout() const override
    {
        return std::to_string(1 + (Parameters.SecondaryMoonEnabled ? 1 : 0)) + "/4";
    }

  private:
    MoonConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
