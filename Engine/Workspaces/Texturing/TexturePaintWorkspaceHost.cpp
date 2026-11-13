/*==========================================================================================================================================
                                                      TEXTUREPAINTWORKSPACEHOST.CPP
==========================================================================================================================================*/
// 🏗️ Implementation of TexturePaintWorkspaceHost 3-column dock + ContentBrowser brush/layer colour integration.

#include "Engine/Workspaces/Texturing/TexturePaintWorkspaceHost.h"

namespace Frontier::Workspaces
{

TexturePaintWorkspaceHost::TexturePaintWorkspaceHost()
{
    LayerStackPane.AttachSession(&Session);
    ViewportPane.AttachSession(&Session);
    InspectorPane.AttachSession(&Session);
    InspectorPane.AssignOpenBrushInspectorCallback([this]() { ViewportPane.SetBrushInspectorOpen(true); });
}

void TexturePaintWorkspaceHost::ConfigureLaunchPolicy(const Configuration::EngineConfiguration& Config) noexcept
{
    ActiveEngineConfig = Config;
}

void TexturePaintWorkspaceHost::AttachContentBrowserPanel(ContentBrowserPanel* TargetPanel)
{
    BoundBrowserPanel = TargetPanel;
    if (TargetPanel == nullptr)
    {
        return;
    }

    TargetPanel->ClearColourSlots();
    TargetPanel->RegisterColourSlot(ColourSlotRegistration{
        "paint.brush_ink",
        "Brush Ink Colour",
        Rectangle2D{ 1520.0f, 380.0f, 260.0f, 40.0f },
        nullptr,
        [this](ColorRgba AssignedRgba, const ColourCodexEntry&)
        {
            Session.Brush.InkColor = AssignedRgba;
            if (auto* Sel = Session.AccessSelectedLayer())
            {
                Sel->PrimerTint = AssignedRgba;
            }
        },
    });
    TargetPanel->FocusColourSlot("paint.brush_ink");
}

#if FRONTIER_EDITOR_ENABLED
void TexturePaintWorkspaceHost::AttachContentBrowser(Editor::Explorer::ContentBrowser* TargetBrowser)
{
    BoundBrowser = TargetBrowser;
    AttachContentBrowserPanel(TargetBrowser != nullptr ? &TargetBrowser->AccessPanel() : nullptr);
}
#endif

void TexturePaintWorkspaceHost::RegisterDockPanes(Components::HeadlessWorkspaceDockContainer& DockContainer)
{
    using Components::DockPlacementDirection;
    using Components::PaneDirectiveMask;
    using Components::WorkspaceDockPaneDescriptor;

    RegisteredTabCount = 0u;

    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        "Layers",
        DockPlacementDirection::SplitLeft,
        0.22f,
        PaneDirectiveMask::StandardPaneDirectives,
        [this]() { LayerStackPane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });

    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        "Texture Paint",
        DockPlacementDirection::CenterTabGroup,
        0.53f,
        PaneDirectiveMask::CentralViewportDirectives,
        [this]() { ViewportPane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });
    ++RegisteredTabCount;

    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        "Layer Inspector",
        DockPlacementDirection::SplitRight,
        0.25f,
        PaneDirectiveMask::StandardPaneDirectives,
        [this]() { InspectorPane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });
}

} // namespace Frontier::Workspaces
