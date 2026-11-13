/*==========================================================================================================================================
                                                       PATTERNSTAMPWORKSPACEHOST.CPP
==========================================================================================================================================*/
// 🧩 Implementation of shared 3-column Pattern Studio & Stamp Studio workspace host + ContentBrowser preset/colour integration.

#include "Engine/Workspaces/Texturing/PatternStampWorkspaceHost.h"

namespace Frontier::Workspaces
{

PatternStampWorkspaceHost::PatternStampWorkspaceHost(PatternStampWorkspaceMode InitialMode)
    : Session(InitialMode)
{
    LayerStackPane.AttachSession(&Session);
    ToolHeaderPane.AttachSession(&Session);
    InspectorPane.AttachSession(&Session);
}

void PatternStampWorkspaceHost::ConfigureMode(PatternStampWorkspaceMode TargetMode) noexcept
{
    Session.ConfigureMode(TargetMode);
    LayerStackPane.AttachSession(&Session);
    ToolHeaderPane.AttachSession(&Session);
    InspectorPane.AttachSession(&Session);
}

void PatternStampWorkspaceHost::ConfigureLaunchPolicy(const Configuration::EngineConfiguration& Config) noexcept
{
    ActiveEngineConfig = Config;
}

void PatternStampWorkspaceHost::AttachContentBrowserPanel(ContentBrowserPanel* TargetPanel)
{
    BoundBrowserPanel = TargetPanel;
    if (TargetPanel == nullptr)
    {
        return;
    }

    TargetPanel->ClearColourSlots();
    const char* SlotId = (Session.Mode == PatternStampWorkspaceMode::Pattern) ? "pattern.layer_fill" : "stamp.layer_fill";
    const char* SlotTitle = (Session.Mode == PatternStampWorkspaceMode::Pattern) ? "Pattern Layer Fill" : "Stamp Layer Fill";
    TargetPanel->RegisterColourSlot(ColourSlotRegistration{
        SlotId,
        SlotTitle,
        Rectangle2D{ 1520.0f, 380.0f, 260.0f, 40.0f },
        nullptr,
        [this](ColorRgba AssignedRgba, const ColourCodexEntry&)
        {
            if (auto* Sel = Session.InspectSelectedLayer())
            {
                Session.PushUndoSnapshot();
                Sel->FillTint = AssignedRgba;
            }
        },
    });
    TargetPanel->FocusColourSlot(SlotId);
}

#if FRONTIER_EDITOR_ENABLED
void PatternStampWorkspaceHost::AttachContentBrowser(Editor::Explorer::ContentBrowser* TargetBrowser)
{
    BoundBrowser = TargetBrowser;
    AttachContentBrowserPanel(TargetBrowser != nullptr ? &TargetBrowser->AccessPanel() : nullptr);
}
#endif

void PatternStampWorkspaceHost::RegisterDockPanes(Components::HeadlessWorkspaceDockContainer& DockContainer)
{
    using Components::DockPlacementDirection;
    using Components::PaneDirectiveMask;
    using Components::WorkspaceDockPaneDescriptor;

    RegisteredTabCount = 0u;

    // 3-Column Studio layout matching 01-HTML-pattern.png & 01-HTML-stamp.png: Left Layers | Center Pattern/Stamp | Right Inspector
    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        "Layers",
        DockPlacementDirection::SplitLeft,
        0.21f,
        PaneDirectiveMask::StandardPaneDirectives,
        [this]() { LayerStackPane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });

    const char* CenterTitle = (Session.Mode == PatternStampWorkspaceMode::Pattern) ? "Pattern" : "Stamp";
    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        CenterTitle,
        DockPlacementDirection::CenterTabGroup,
        0.54f,
        PaneDirectiveMask::CentralViewportDirectives,
        [this]() { ToolHeaderPane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });
    ++RegisteredTabCount;

    (void)DockContainer.RegisterPane(WorkspaceDockPaneDescriptor{
        "Inspector",
        DockPlacementDirection::SplitRight,
        0.25f,
        PaneDirectiveMask::StandardPaneDirectives,
        [this]() { InspectorPane.PresentInImGuiPane(1.0 / 60.0, 1.0f); },
    });
}

} // namespace Frontier::Workspaces
