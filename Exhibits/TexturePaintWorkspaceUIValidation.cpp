/*==========================================================================================================================================
                                               TEXTUREPAINTWORKSPACEUIVALIDATION.CPP
==========================================================================================================================================*/
// 🧪 Domain & ImGui UI exhibit for Texture Paint Studio (layers, 22 PBR channels, undo/redo, masks, Brush Inspector & 3D + 2D UV Split).

#include "Engine/Components/Appearance/ThemeRepository.h"
#include "Engine/Components/Appearance/TypographyRepository.h"
#include "Engine/Components/ControlCentre/ControlCentrePanel.h"
#include "Engine/Components/Docking/WorkspaceDockContainer.h"
#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Configuration/EngineConfiguration.h"
#include "Engine/Workspaces/Texturing/TexturePaintWorkspaceHost.h"
#include "Exhibits/SoftwareCanvasRasterizer.h"

#include <imgui.h>
#include <imgui_internal.h>

#include <cstdio>
#include <filesystem>
#include <string_view>

namespace
{

[[nodiscard]] bool VerifyCondition(bool Condition, const char* Description) noexcept
{
    if (!Condition)
    {
        std::fprintf(stderr, "[TexturePaintWorkspaceUIValidation] FAIL: %s\n", Description);
        return false;
    }
    return true;
}

[[nodiscard]] bool CapturePaintWorkspacePng(
    ImGuiIO&                                              Io,
    Frontier::Components::HeadlessWorkspaceDockContainer& Dock,
    Frontier::ControlCentrePanel&                         ControlCentre,
    const std::filesystem::path&                          TargetPngPath,
    uint32_t                                              WidthPx  = 1600u,
    uint32_t                                              HeightPx = 980u)
{
    for (int Tick = 0; Tick < 3; ++Tick)
    {
        Io.DisplaySize = ImVec2(static_cast<float>(WidthPx), static_cast<float>(HeightPx));
        Io.DeltaTime   = 1.0f / 60.0f;
        ImGui::NewFrame();
        Dock.PresentWindowImGuiPanes(Frontier::Components::HostWindowToken{ 0u });
        ControlCentre.Render({ 0.0f, 0.0f, static_cast<float>(WidthPx), static_cast<float>(HeightPx) }, 1.0 / 60.0, 60.0f);
        ImGui::Render();
    }

    Frontier::Exhibits::SoftwareRasterCanvas Canvas(WidthPx, HeightPx, { 16, 17, 20, 255 });
    Canvas.RasterizeImGuiBatches(ImGui::GetDrawData());
    return VerifyCondition(Canvas.WritePngFile(TargetPngPath), TargetPngPath.filename().string().c_str());
}

} // namespace

int main()
{
    using namespace Frontier;
    using namespace Frontier::Configuration;
    using namespace Frontier::Workspaces;

    const std::filesystem::path RepoRoot = Exhibits::ResolveRepositoryRootPath();
    const std::filesystem::path ImageDir = RepoRoot / "Exhibits/Images/Texturing";
    std::filesystem::create_directories(ImageDir);

    // 1. Validate TexturePaintSession domain logic (layers, 22 PBR channels, undo/redo, stamps, masks, tools)
    {
        TexturePaintWorkspaceHost Host {};
        auto& Sess = Host.AccessSession();

        if (!VerifyCondition(Sess.DocumentName == "Teapot Paint", "Default document is Teapot Paint") ||
            !VerifyCondition(Sess.ResolutionPx == 512u, "Default paint resolution is 512px") ||
            !VerifyCondition(Sess.Layers.size() == 2u, "Default stack contains 2 layers (Base Ceramic Coat + Hand Painted Layer)") ||
            !VerifyCondition(Sess.InspectSelectedLayer() != nullptr && Sess.InspectSelectedLayer()->CountActiveChannels() == 4u, "Hand Painted Layer initializes 4 active PBR channels") ||
            !VerifyCondition(Sess.CountVisibleLayers() == 2u && Sess.CountHiddenLayers() == 0u, "2 visible, 0 hidden layers"))
        {
            return 1;
        }

        Sess.AddChannelToSelectedLayer(PaintSurfaceChannel::Clearcoat);
        if (!VerifyCondition(Sess.InspectSelectedLayer()->CountActiveChannels() == 5u, "Adding Clearcoat produces 5 active PBR channels"))
        {
            return 1;
        }
        if (!VerifyCondition(Sess.ApplyUndo() && Sess.InspectSelectedLayer()->CountActiveChannels() == 4u, "Undo reverts Clearcoat channel") ||
            !VerifyCondition(Sess.ApplyRedo() && Sess.InspectSelectedLayer()->CountActiveChannels() == 5u, "Redo restores Clearcoat channel"))
        {
            return 1;
        }

        Sess.AddLayer(PaintLayerCategory::WearGen);
        Sess.ToggleOrCreateMaskOnSelectedLayer();
        Sess.AssignResolution(1024u);
        if (!VerifyCondition(Sess.Layers.size() == 3u && Sess.InspectSelectedLayer()->Mask.Attached && Sess.ResolutionPx == 1024u, "WearGen creation, mask attach & 1024px resize"))
        {
            return 1;
        }

        Sess.DuplicateSelectedLayer();
        Sess.MoveSelectedLayerDown();
        if (!VerifyCondition(Sess.Layers.size() == 4u, "Layer duplicate & reorder succeeded"))
        {
            return 1;
        }
        Sess.DeleteSelectedLayer();
        if (!VerifyCondition(Sess.Layers.size() == 3u, "DeleteLayer shrinks stack cleanly"))
        {
            return 1;
        }
    }

    // 2. Initialize Typography + ImGui runtime
    IMGUI_CHECKVERSION();
    ImGuiContext* GuiCtx = ImGui::CreateContext();
    ImGui::SetCurrentContext(GuiCtx);
    ImGuiIO& Io    = ImGui::GetIO();
    Io.IniFilename = nullptr;
    Io.LogFilename = nullptr;
    Io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;

    TypographyRepository Typefaces {};
    (void)Typefaces.LoadRepository(RepoRoot / "EngineContent/FontsArchives");
    TypographyRepository::AssignCurrent(&Typefaces);
    if (ImFont* TabFont = Typefaces.QueryTabStripFont())
    {
        Io.FontDefault = TabFont;
    }

    unsigned char* FontSheetPixels = nullptr;
    int            FontSheetWidth  = 0;
    int            FontSheetHeight = 0;
    Io.Fonts->GetTexDataAsRGBA32(&FontSheetPixels, &FontSheetWidth, &FontSheetHeight);

    // 3. Mount 3-Column Texture Paint Dock & Capture Exhibits 12..15
    {
        TexturePaintWorkspaceHost PaintHost {};
        PaintHost.ConfigureLaunchPolicy(EngineConfiguration(EngineConfiguration::ConstructFeatureSetDefault()));

        Components::HeadlessWorkspaceDockContainer Dock {};
        const auto WinDesc = Windowing::WindowConfigurationDescriptor::ConstructApplicationWindow("Frontier Texture Paint Studio", 1600, 980);
        if (!VerifyCondition(Dock.Initialize(WinDesc), "Initialized HeadlessWorkspaceDockContainer for Texture Paint"))
        {
            return 1;
        }
        PaintHost.RegisterDockPanes(Dock);

        ThemeRepository Theme {};
        Theme.ConfigureTheme(ThemePreset::Dark);
        Components::ConfigureImGuiWorkspaceTheme(Dock.ActiveTabMetrics(), Theme);

        ControlCentrePanel ControlCentre {};
        ControlCentre.AttachTypefaces(&Typefaces);
        ControlCentre.AccessDraftAppearance().Theme = ThemePreset::Dark;
        ControlCentre.ApplyDraftAppearanceImmediate();
        ControlCentre.AccessNotificationStream().ClearPending();

        // Exhibit 12: Main Texture Paint Workspace (matches 07-HTML-paint.png)
        if (!CapturePaintWorkspacePng(Io, Dock, ControlCentre, ImageDir / "12-TexturePaintWorkspaceMain.png"))
        {
            return 1;
        }

        // Verify Left -> Center -> Right 3-column dock alignment
        {
            ImGuiWindow* LayersWin    = nullptr;
            ImGuiWindow* ViewportWin  = nullptr;
            ImGuiWindow* InspectorWin = nullptr;
            if (ImGuiContext* Ctx = ImGui::GetCurrentContext())
            {
                for (ImGuiWindow* Win : Ctx->Windows)
                {
                    if (Win != nullptr && Win->Active)
                    {
                        const std::string_view Name(Win->Name);
                        if (Name.starts_with("Layers##")) LayersWin = Win;
                        else if (Name.starts_with("Texture Paint##")) ViewportWin = Win;
                        else if (Name.starts_with("Layer Inspector##")) InspectorWin = Win;
                    }
                }
            }
            if (!VerifyCondition(LayersWin != nullptr && ViewportWin != nullptr && InspectorWin != nullptr, "All 3 Texture Paint columns mounted") ||
                !VerifyCondition(LayersWin->Pos.x + LayersWin->Size.x <= ViewportWin->Pos.x + 2.0f && ViewportWin->Pos.x + ViewportWin->Size.x <= InspectorWin->Pos.x + 2.0f, "Left -> Center -> Right 3-column alignment verified"))
            {
                return 1;
            }
        }

        // Exhibit 13: Brush Inspector Floating Overlay (Tip & PBR sub-tab, matches 09-HTML-paint-brush-menu.png)
        PaintHost.AccessViewportPane().SetBrushInspectorOpen(true);
        if (!CapturePaintWorkspacePng(Io, Dock, ControlCentre, ImageDir / "13-TexturePaintBrushInspector.png"))
        {
            return 1;
        }

        // Exhibit 14: Add Layer Overlay Sheet + Mask Sub-row + Right Inspector scrolled to Layer Mask & Viewport Options
        PaintHost.AccessViewportPane().CloseAllOverlays();
        PaintHost.AccessSession().ToggleOrCreateMaskOnSelectedLayer();
        PaintHost.AccessLayerStackPane().SetAddLayerSheetOpen(true);
        PaintHost.AccessInspectorPane().SetScrollOffsetY(380.0f);
        if (!CapturePaintWorkspacePng(Io, Dock, ControlCentre, ImageDir / "14-TexturePaintAddLayerAndMask.png"))
        {
            return 1;
        }

        // Exhibit 15: 3D + 2D UV Split View + Brush Inspector Curves Sub-tab
        PaintHost.AccessLayerStackPane().SetAddLayerSheetOpen(false);
        PaintHost.AccessInspectorPane().SetScrollOffsetY(0.0f);
        PaintHost.AccessSession().ViewportLayout  = PaintViewportLayout::SplitView;
        PaintHost.AccessSession().InspectorSubTab = BrushDetailSubTab::Curves;
        PaintHost.AccessViewportPane().SetBrushInspectorOpen(true);
        if (!CapturePaintWorkspacePng(Io, Dock, ControlCentre, ImageDir / "15-TexturePaintSplitUvAndCurves.png"))
        {
            return 1;
        }

        Dock.Finalize();
    }

    ImGui::DestroyContext(GuiCtx);
    TypographyRepository::AssignCurrent(nullptr);
    std::printf("[TexturePaintWorkspaceUIValidation] ALL CHECKS PASSED\n");
    return 0;
}
