/*==========================================================================================================================================
                                                           DIAGNOSTICSINSPECTOR.H
==========================================================================================================================================*/
// 🧩 DiagnosticsConfiguration: timing and memory overlays.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    DIAGNOSTICS INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class DiagnosticsInspector final : public RecordInspector
{
  public:
    explicit DiagnosticsInspector(DiagnosticsConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "DIAGNOSTICS · FRAME TELEMETRY"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "Frame budget"; }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    DiagnosticsConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
