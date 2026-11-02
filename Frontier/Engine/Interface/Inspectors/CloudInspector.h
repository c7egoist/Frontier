/*==========================================================================================================================================
                                                              CLOUDINSPECTOR.H
==========================================================================================================================================*/
// 🧩 CloudConfiguration: the global cloud layer and bounded local clouds.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    CLOUD INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class CloudInspector final : public RecordInspector
{
  public:
    explicit CloudInspector(CloudConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override
    {
        return Parameters.LocalVolume ? "ENVIRONMENT · LOCAL CLOUD" : "ENVIRONMENT · CLOUDS";
    }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "3D Perlin-Worley raymarch"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;
    [[nodiscard]] const char* QueryDirectoryGlyph() const noexcept override { return Parameters.LocalVolume ? "NativeLocalCloud" : "NativeClouds"; }

  private:
    CloudConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
