/*==========================================================================================================================================
                                                        PATTERNSTAMPWORKSPACEHOST.H
==========================================================================================================================================*/
// 🧩 Shared 3-column Workspace host mounting Layers (Left), Pattern/Stamp Tool Chrome (Center), Inspector (Right) + ContentBrowser bridge.

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/ContentBrowser/ContentBrowserPanel.h"
#include "Engine/Components/Docking/WorkspaceDockContainer.h"
#include "Engine/Configuration/BuildConfiguration.h"
#include "Engine/Configuration/EngineConfiguration.h"
#include "Engine/Workspaces/Texturing/PatternStampInspectorPane.h"
#include "Engine/Workspaces/Texturing/PatternStampLayerStackPane.h"
#include "Engine/Workspaces/Texturing/PatternStampStackSession.h"
#include "Engine/Workspaces/Texturing/PatternStampToolHeaderPane.h"

#if FRONTIER_EDITOR_ENABLED
#include "Engine/Editor/Explorer/ContentBrowser.h"
#endif

#include <cstdint>

namespace Frontier::Workspaces
{

//------------------------------------------------------------------------------------------------------------------------
//                                                  CLASS DECLARATION
//------------------------------------------------------------------------------------------------------------------------

class PatternStampWorkspaceHost
{
public:
    explicit PatternStampWorkspaceHost(PatternStampWorkspaceMode InitialMode = PatternStampWorkspaceMode::Pattern);

    void ConfigureMode(PatternStampWorkspaceMode TargetMode) noexcept;
    void ConfigureLaunchPolicy(const Configuration::EngineConfiguration& Config) noexcept;
    void AttachContentBrowserPanel(ContentBrowserPanel* TargetPanel);
#if FRONTIER_EDITOR_ENABLED
    void AttachContentBrowser(Editor::Explorer::ContentBrowser* TargetBrowser);
#endif

    void RegisterDockPanes(Components::HeadlessWorkspaceDockContainer& DockContainer);

    [[nodiscard]] PatternStampWorkspaceSession&       AccessSession() noexcept       { return Session; }
    [[nodiscard]] const PatternStampWorkspaceSession& InspectSession() const noexcept { return Session; }
    [[nodiscard]] PatternStampLayerStackPane&         AccessLayerStackPane() noexcept { return LayerStackPane; }
    [[nodiscard]] PatternStampToolHeaderPane&         AccessToolHeaderPane() noexcept { return ToolHeaderPane; }
    [[nodiscard]] PatternStampInspectorPane&          AccessInspectorPane() noexcept { return InspectorPane; }
    [[nodiscard]] uint32_t                       QueryRegisteredTabCount() const noexcept { return RegisteredTabCount; }

private:
    Configuration::EngineConfiguration ActiveEngineConfig {};
    PatternStampWorkspaceSession            Session            { PatternStampWorkspaceMode::Pattern };
    PatternStampLayerStackPane              LayerStackPane     {};
    PatternStampToolHeaderPane              ToolHeaderPane     {};
    PatternStampInspectorPane               InspectorPane      {};
    uint32_t                           RegisteredTabCount = 0u;
    ContentBrowserPanel*               BoundBrowserPanel  = nullptr;
#if FRONTIER_EDITOR_ENABLED
    Editor::Explorer::ContentBrowser*  BoundBrowser       = nullptr;
#endif
};

} // namespace Frontier::Workspaces
