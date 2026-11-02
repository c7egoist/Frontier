/*==========================================================================================================================================
                                                         RENDERPIPELINEINSPECTOR.H
==========================================================================================================================================*/
// 🧩 RenderPipelineConfiguration: the ported renderer's switches, quality and inspection views.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    RENDER PIPELINE INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class RenderPipelineInspector final : public RecordInspector
{
  public:
    explicit RenderPipelineInspector(RenderPipelineConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "RENDER · PIPELINE"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override
    {
        return Parameters.HardwareRayQueryTier ? "RTX · RayQuery" : "GTX · 4-Cascade SDF + BVH";
    }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    RenderPipelineConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
