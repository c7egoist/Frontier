/*============================================================================================================================================
                                                         MATERIALWORKSPACEHOST.H
============================================================================================================================================*/
// 🧩 Standalone & Editor Material Workspace host mounting central Shader Preview UI surface + right Material Inspector (zero 3D viewport)

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/ContentBrowser/ContentBrowserPanel.h"
#include "Engine/Components/Docking/WorkspaceDockContainer.h"
#include "Engine/Configuration/BuildConfiguration.h"
#include "Engine/Configuration/EngineConfiguration.h"
#include "Engine/Workspaces/Texturing/MaterialInspectorPane.h"
#include "Engine/Workspaces/Texturing/MaterialSurfacePane.h"
#include "Engine/Workspaces/Texturing/MaterialWorkspaceSession.h"

#if FRONTIER_EDITOR_ENABLED
#include "Engine/Editor/Explorer/ContentBrowser.h"
#endif

#include <cstdint>

namespace Frontier::Workspaces
{

class MaterialWorkspaceHost
{
public:
    MaterialWorkspaceHost();

    void ConfigureLaunchPolicy(const Configuration::EngineConfiguration& Config) noexcept;
    void AttachContentBrowserPanel(ContentBrowserPanel* TargetPanel);
#if FRONTIER_EDITOR_ENABLED
    void AttachContentBrowser(Editor::Explorer::ContentBrowser* TargetBrowser);
#endif

    void RegisterDockPanes(Components::HeadlessWorkspaceDockContainer& DockContainer);

    [[nodiscard]] MaterialWorkspaceSession&       AccessSession() noexcept       { return Session; }
    [[nodiscard]] const MaterialWorkspaceSession& InspectSession() const noexcept { return Session; }
    [[nodiscard]] MaterialSurfacePane&            AccessSurfacePane() noexcept   { return SurfacePane; }
    [[nodiscard]] MaterialInspectorPane&          AccessInspectorPane() noexcept { return InspectorPane; }
    [[nodiscard]] uint32_t                        QueryRegisteredTabCount() const noexcept { return RegisteredTabCount; }

private:
    Configuration::EngineConfiguration ActiveEngineConfig {};
    MaterialWorkspaceSession           Session            {};
    MaterialSurfacePane                SurfacePane        {};
    MaterialInspectorPane              InspectorPane      {};
    uint32_t                           RegisteredTabCount = 0u;
    ContentBrowserPanel*               BoundBrowserPanel  = nullptr;
#if FRONTIER_EDITOR_ENABLED
    Editor::Explorer::ContentBrowser*  BoundBrowser       = nullptr;
#endif
};

} // namespace Frontier::Workspaces
