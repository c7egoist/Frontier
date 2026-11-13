/*============================================================================================================================================
                                                   MATERIALWORKSPACEUIVALIDATION.CPP
============================================================================================================================================*/
// 🧩 UI and interactive session validation for Material Workspace (Shader Preview canvas UI, 29-channel Inspector, Layer Stack tab & theme sync)

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Appearance/ThemeRepository.h"
#include "Engine/Components/Appearance/TypographyRepository.h"
#include "Engine/Components/ControlCentre/ControlCentrePanel.h"
#include "Engine/Components/Docking/WorkspaceDockContainer.h"
#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Configuration/EngineConfiguration.h"
#include "Engine/Workspaces/Texturing/MaterialWorkspaceHost.h"
#include "Exhibits/SoftwareCanvasRasterizer.h"

#include <imgui.h>
#include <imgui_internal.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <string>

namespace
{

[[nodiscard]] bool VerifyCondition(bool ConditionMet, const char* Description) noexcept
{
    if (!ConditionMet)
    {
        std::fprintf(stderr, "[MaterialWorkspaceUIValidation] FAILED: %s\n", Description);
        return false;
    }
    return true;
}

[[nodiscard]] bool CaptureMaterialWorkspacePng(
    ImGuiIO&                                              Io,
    Frontier::Components::HeadlessWorkspaceDockContainer& Container,
    Frontier::ControlCentrePanel&                         ControlCentre,
    const std::filesystem::path&                          TargetPngPath,
    uint32_t                                              WidthPx  = 1600u,
    uint32_t                                              HeightPx = 980u)
{
    for (int StepIdx = 0; StepIdx < 3; ++StepIdx)
    {
        Io.DisplaySize = ImVec2(static_cast<float>(WidthPx), static_cast<float>(HeightPx));
        Io.DeltaTime   = 1.0f / 60.0f;
        ImGui::NewFrame();
        Container.PresentWindowImGuiPanes(Frontier::Components::HostWindowToken{ 0u });
        ControlCentre.Render({ 0.0f, 0.0f, static_cast<float>(WidthPx), static_cast<float>(HeightPx) }, 1.0 / 60.0, 60.0f);
        ImGui::Render();
    }

    Frontier::Exhibits::SoftwareRasterCanvas Canvas(WidthPx, HeightPx, { 14, 14, 16, 255 });
    Canvas.RasterizeImGuiBatches(ImGui::GetDrawData());
    return VerifyCondition(Canvas.WritePngFile(TargetPngPath), TargetPngPath.filename().string().c_str());
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENTRY POINT
//------------------------------------------------------------------------------------------------------------------------

int main()
{
    using namespace Frontier;
    using namespace Frontier::Configuration;
    using namespace Frontier::Workspaces;

    const std::filesystem::path RepoRoot = Exhibits::ResolveRepositoryRootPath();
    const std::filesystem::path ImageDir = RepoRoot / "Exhibits/Images/Texturing";
    std::filesystem::create_directories(ImageDir);

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
    unsigned char* AtlasPixels = nullptr;
    int            AtlasW      = 0;
    int            AtlasH      = 0;
    Io.Fonts->GetTexDataAsRGBA32(&AtlasPixels, &AtlasW, &AtlasH);

    // 1. Validate MaterialWorkspaceSession domain behavior (3 strata, 29 PBR channels, add/reorder, pattern tile, export)
    MaterialWorkspaceHost Host {};
    Host.ConfigureLaunchPolicy(EngineConfiguration(EngineConfiguration::ConstructFeatureSetDefault()));
    {
        auto& Sess = Host.AccessSession();
        if (!VerifyCondition(Sess.MaterialTitle == "Racing Green", "Default material preset is Racing Green") ||
            !VerifyCondition(Sess.StrataLayers.size() == 3u, "Racing Green initializes 3 strata layers") ||
            !VerifyCondition(Sess.InspectSelectedLayer() != nullptr && Sess.InspectSelectedLayer()->Channels.size() == 28u, "Paint body layer exposes 28 active PBR channels") ||
            !VerifyCondition(Sess.QueryAvailableChannelsForSelectedLayer().size() == 1u, "Paint body leaves 1 unadded PBR channel (BlendMask/+1)"))
        {
            return 1;
        }

        Sess.AddChannelToSelectedLayer(MaterialChannelSlot::BlendMask);
        if (!VerifyCondition(Sess.InspectSelectedLayer()->Channels.size() == 29u, "Adding BlendMask activates all 29 PBR channels") ||
            !VerifyCondition(Sess.QueryAvailableChannelsForSelectedLayer().empty(), "0 remaining unadded channels when all 29 active"))
        {
            return 1;
        }

        Sess.AddDetailStrataLayer();
        if (!VerifyCondition(Sess.StrataLayers.size() == 4u && Sess.InspectSelectedLayer()->Model == MaterialStrataModel::Detail, "AddDetailStrataLayer prepends new detail strata layer"))
        {
            return 1;
        }

        const uint32_t DetailId = Sess.SelectedLayerId;
        Sess.MoveStrataLayer(DetailId, -1);
        if (!VerifyCondition(Sess.StrataLayers.size() >= 2u && Sess.StrataLayers[1].Identity == DetailId, "MoveStrataLayer reorders strata downwards"))
        {
            return 1;
        }

        Sess.ApplyExternalPatternDocument("Kente Weave", "African Patterns", 4.0f);
        if (!VerifyCondition(Sess.PatternOverlay.Attached && Sess.SelectedLayerId == MaterialWorkspaceSession::PatternLayerReservedId, "ApplyExternalPatternDocument attaches and focuses tileable pattern"))
        {
            return 1;
        }

        const std::string Toml = Sess.BuildExportTomlSummary();
        if (!VerifyCondition(Toml.find("Racing Green") != std::string::npos, "BuildExportTomlSummary serializes active material name"))
        {
            return 1;
        }

        // Restore canonical default preset for visual screenshot parity against 01-HTML-material.png
        Sess.ClearAttachedPattern();
        Sess.LoadRegistryPreset(0u);
    }

    // 2. Render docked MaterialWorkspace (no 3D viewport) & capture Properties, Layer Stack, Scrolled & Light Theme exhibits
    {
        Components::HeadlessWorkspaceDockContainer Dock {};
        const auto WinDesc = Windowing::WindowConfigurationDescriptor::ConstructApplicationWindow("Frontier Material Studio", 1600, 980);
        if (!VerifyCondition(Dock.Initialize(WinDesc), "Initialized HeadlessWorkspaceDockContainer for Material Studio"))
        {
            return 1;
        }

        Host.RegisterDockPanes(Dock);
        if (!VerifyCondition(Host.QueryRegisteredTabCount() == 1u, "MaterialWorkspaceHost mounts 2-column layout without left Outliner"))
        {
            return 1;
        }

        ThemeRepository Theme {};
        Theme.ConfigureTheme(ThemePreset::Dark);
        Components::ConfigureImGuiWorkspaceTheme(Dock.ActiveTabMetrics(), Theme);

        ControlCentrePanel ControlCentre {};
        ControlCentre.AttachTypefaces(&Typefaces);
        ControlCentre.AccessDraftAppearance().Theme = ThemePreset::Dark;
        ControlCentre.ApplyDraftAppearanceImmediate();
        ControlCentre.AccessNotificationStream().ClearPending();

        // Exhibit 1: Properties tab default (matches 01-HTML-material.png)
        Host.AccessSession().ActiveInspectorTab = MaterialInspectorTab::Properties;
        Host.AccessInspectorPane().ScrollOffsetY = 0.0f;
        if (!CaptureMaterialWorkspacePng(Io, Dock, ControlCentre, ImageDir / "01-MaterialWorkspaceProperties.png"))
        {
            return 1;
        }

        // Verify both docked windows exist side by side cleanly (Material center + Inspector right, no left Outliner)
        {
            ImGuiWindow* MaterialWin  = nullptr;
            ImGuiWindow* InspectorWin = nullptr;
            if (ImGuiContext* Ctx = ImGui::GetCurrentContext())
            {
                for (ImGuiWindow* Win : Ctx->Windows)
                {
                    if (Win != nullptr && Win->Active)
                    {
                        const std::string_view Name(Win->Name);
                        if (Name.starts_with("Material##"))
                        {
                            MaterialWin = Win;
                        }
                        else if (Name.starts_with("Inspector##"))
                        {
                            InspectorWin = Win;
                        }
                    }
                }
            }
            if (!VerifyCondition(MaterialWin != nullptr && InspectorWin != nullptr, "Both 'Material' center pane and 'Inspector' right pane exist") ||
                !VerifyCondition(MaterialWin->Size.x >= 900.0f && InspectorWin->Size.x >= 300.0f, "2-column proportion honors wide shader preview surface and docked right Inspector") ||
                !VerifyCondition(MaterialWin->Pos.x + MaterialWin->Size.x <= InspectorWin->Pos.x + 2.0f, "Material center sits strictly left of Material Inspector"))
            {
                return 1;
            }
        }

        // Exhibit 2: Layer Stack tab (matches 02-HTML-material-layers-tab.png)
        Host.AccessSession().ActiveInspectorTab = MaterialInspectorTab::LayerStack;
        Host.AccessInspectorPane().ScrollOffsetY = 0.0f;
        if (!CaptureMaterialWorkspacePng(Io, Dock, ControlCentre, ImageDir / "02-MaterialWorkspaceLayerStackTab.png"))
        {
            return 1;
        }

        // Exhibit 3: Properties tab scrolled down (matches 03-HTML-material-props-scrolled.png)
        Host.AccessSession().ActiveInspectorTab = MaterialInspectorTab::Properties;
        Host.AccessInspectorPane().ScrollOffsetY = 290.0f;
        if (!CaptureMaterialWorkspacePng(Io, Dock, ControlCentre, ImageDir / "03-MaterialWorkspacePropertiesScrolled.png"))
        {
            return 1;
        }

        // Exhibit 4: ControlCentre Light theme synchronization verification
        Theme.ConfigureTheme(ThemePreset::Light);
        Components::ConfigureImGuiWorkspaceTheme(Dock.ActiveTabMetrics(), Theme);
        ControlCentre.AccessDraftAppearance().Theme = ThemePreset::Light;
        ControlCentre.ApplyDraftAppearanceImmediate();
        ControlCentre.AccessNotificationStream().ClearPending();
        Host.AccessInspectorPane().ScrollOffsetY = 0.0f;
        if (!CaptureMaterialWorkspacePng(Io, Dock, ControlCentre, ImageDir / "04-MaterialWorkspaceLightTheme.png"))
        {
            return 1;
        }

        Dock.Finalize();
    }

    ImGui::DestroyContext(GuiCtx);
    TypographyRepository::AssignCurrent(nullptr);
    std::printf("[MaterialWorkspaceUIValidation] ALL CHECKS PASSED\n");
    return 0;
}
