/*==========================================================================================================================================
                                                       TEXTUREPAINTWORKSPACEHOST.H
==========================================================================================================================================*/
// 🏗️ 3-column dock host for Frontier Texture Paint Studio: Layers (left) | Texture Paint (center) | Layer Inspector (right).

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/ContentBrowser/ContentBrowserPanel.h"
#include "Engine/Components/Docking/WorkspaceDockContainer.h"
#include "Engine/Configuration/BuildConfiguration.h"
#include "Engine/Configuration/EngineConfiguration.h"
#include "Engine/Workspaces/Texturing/TexturePaintInspectorPane.h"
#include "Engine/Workspaces/Texturing/TexturePaintLayerStackPane.h"
#include "Engine/Workspaces/Texturing/TexturePaintSession.h"
#include "Engine/Workspaces/Texturing/TexturePaintViewportPane.h"

#if FRONTIER_EDITOR_ENABLED
#include "Engine/Editor/Explorer/ContentBrowser.h"
#endif

namespace Frontier::Workspaces
{

class TexturePaintWorkspaceHost
{
public:
    TexturePaintWorkspaceHost();
    ~TexturePaintWorkspaceHost() noexcept = default;

    void ConfigureLaunchPolicy(const Configuration::EngineConfiguration& Config) noexcept;
    void AttachContentBrowserPanel(ContentBrowserPanel* TargetPanel);
#if FRONTIER_EDITOR_ENABLED
    void AttachContentBrowser(Editor::Explorer::ContentBrowser* TargetBrowser);
#endif
    void RegisterDockPanes(Components::HeadlessWorkspaceDockContainer& DockContainer);

    [[nodiscard]] TexturePaintSession&            AccessSession() noexcept { return Session; }
    [[nodiscard]] const TexturePaintSession&      InspectSession() const noexcept { return Session; }

    [[nodiscard]] TexturePaintLayerStackPane&     AccessLayerStackPane() noexcept { return LayerStackPane; }
    [[nodiscard]] TexturePaintViewportPane&       AccessViewportPane() noexcept { return ViewportPane; }
    [[nodiscard]] TexturePaintInspectorPane&      AccessInspectorPane() noexcept { return InspectorPane; }

    [[nodiscard]] std::size_t QueryRegisteredTabCount() const noexcept { return RegisteredTabCount; }

private:
    TexturePaintSession              Session            {};
    TexturePaintLayerStackPane       LayerStackPane     {};
    TexturePaintViewportPane         ViewportPane       {};
    TexturePaintInspectorPane        InspectorPane      {};
    Configuration::EngineConfiguration ActiveEngineConfig {};
    ContentBrowserPanel*             BoundBrowserPanel  = nullptr;
#if FRONTIER_EDITOR_ENABLED
    Editor::Explorer::ContentBrowser* BoundBrowser      = nullptr;
#endif
    std::size_t                      RegisteredTabCount = 0u;
};

} // namespace Frontier::Workspaces
