/*============================================================================================================================================
                                                        MATERIALWORKSPACEHOST.CPP
============================================================================================================================================*/
// 🧩 Implementation of MaterialWorkspaceHost registering Material Surface & Inspector docked panes + ContentBrowser integration

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/Texturing/MaterialWorkspaceHost.h"

namespace Frontier::Workspaces
{

MaterialWorkspaceHost::MaterialWorkspaceHost()
{
    SurfacePane.AttachSession(&Session);
    InspectorPane.AttachSession(&Session);
}

void MaterialWorkspaceHost::ConfigureLaunchPolicy(const Configuration::EngineConfiguration& Config) noexcept
{
    ActiveEngineConfig = Config;
}

void MaterialWorkspaceHost::AttachContentBrowserPanel(ContentBrowserPanel* TargetPanel)
{
    BoundBrowserPanel = TargetPanel;
    Session.AttachContentBrowserPanel(TargetPanel);
    if (TargetPanel == nullptr)
    {
        return;
    }

    TargetPanel->ClearColourSlots();
    TargetPanel->RegisterColourSlot(ColourSlotRegistration{
        "material.primary_albedo",
        "Material Primary Albedo",
        Rectangle2D{ 1520.0f, 380.0f, 260.0f, 40.0f },
        nullptr,
        [this](ColorRgba AssignedRgba, const ColourCodexEntry&)
        {
            Session.ApplyPrimaryAlbedoColor(AssignedRgba);
        },
    });
    TargetPanel->FocusColourSlot("material.primary_albedo");
}

#if FRONTIER_EDITOR_ENABLED
void MaterialWorkspaceHost::AttachContentBrowser(Editor::Explorer::ContentBrowser* TargetBrowser)
{
    BoundBrowser = TargetBrowser;
    AttachContentBrowserPanel(TargetBrowser != nullptr ? &TargetBrowser->AccessPanel() : nullptr);
}
#endif

void MaterialWorkspaceHost::RegisterDockPanes(Components::HeadlessWorkspaceDockContainer& DockContainer)
{
    using Components::DockPlacementDirection;
    using Components::PaneDirectiveMask;
    using Components::WorkspaceDockPaneDescriptor;

    RegisteredTabCount = 0u;

    // 2-Column Studio layout matching HTML MaterialWorkspace: central Shader Preview UI surface + right Material Inspector (no left Outliner)
    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        "Material",
        DockPlacementDirection::CenterTabGroup,
        0.74f,
        PaneDirectiveMask::CentralViewportDirectives,
        [this]() { SurfacePane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });
    ++RegisteredTabCount;

    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        "Inspector",
        DockPlacementDirection::SplitRight,
        0.24f,
        PaneDirectiveMask::StandardPaneDirectives,
        [this]() { InspectorPane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });
}

} // namespace Frontier::Workspaces
