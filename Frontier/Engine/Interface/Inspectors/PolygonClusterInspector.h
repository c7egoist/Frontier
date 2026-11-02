/*==========================================================================================================================================
                                                         POLYGONCLUSTERINSPECTOR.H
==========================================================================================================================================*/
// 🧩 PolygonClusterConfiguration: the cluster hierarchy, with its PolygonClusterEditor.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

//------------------------------------------------------------------------------------------------------------------------
//                                                    POLYGON CLUSTER INSPECTOR
//------------------------------------------------------------------------------------------------------------------------

class PolygonClusterInspector final : public RecordInspector
{
  public:
    explicit PolygonClusterInspector(PolygonClusterConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "RENDER · POLYGON CLUSTERS"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "LOD DAG + Hi-Z"; }
    [[nodiscard]] const char* QueryEditorButtonLabel() const noexcept override { return "Cluster Editor"; }
    void                      ConstructEditor(RecordToken Token) override;
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Enabled; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Enabled = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    void                      EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches) override;
    void                      ConstructInspector() override;

  private:
    PolygonClusterConfiguration& Parameters;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
