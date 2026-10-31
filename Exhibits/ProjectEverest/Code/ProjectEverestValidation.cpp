/*==========================================================================================================================================
                                                      PROJECTEVERESTVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 End-to-end validation and native CPU exhibit capture for Frontier -> Project Browser -> Select Application ->
//    Project Everest -> docked EditorWorkspace (PanelDockspace + ControlCentrePanel UI theme controller +
//    LogStreamPanel + SceneDirectoryPanel Outliner + RecordEntry constructor/destructor lifecycle).

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>

#include "Engine/Diagnostics/LogCategories.h"
#include "Engine/Diagnostics/LogStream.h"
#include "Engine/Interface/ControlKit.h"
#include "Engine/Interface/IconPresentation.h"
#include "Engine/Scene/SceneDirectory.h"
#include "Engine/Scene/SceneRecord.h"
#include "Exhibits/ControlCentre/Code/CpuRasterization.h"
#include "UI/Editor/ControlCentrePanel.h"
#include "UI/Editor/EditorWorkspace.h"
#include "UI/Editor/ProjectBrowserPanel.h"

#include <imgui.h>
#include <imgui_internal.h>

#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace
{

using namespace Frontier;

void Require(bool Condition, const char *Description)
{
    if (!Condition)
    {
        throw std::runtime_error(Description);
    }
}

struct RasterizedCapture
{
    int                        Width  = 0;
    int                        Height = 0;
    std::vector<unsigned char> Pixels;
};

RasterizedCapture RasterizeCurrentFrame(int Width, int Height, ColorQuad ClearColour)
{
    RasterizedCapture Output;
    Output.Width  = Width;
    Output.Height = Height;
    Output.Pixels.resize(static_cast<size_t>(Width) * static_cast<size_t>(Height) * 3u);

    const unsigned char ClearR = static_cast<unsigned char>(std::clamp(ClearColour.Red * 255.0f + 0.5f, 0.0f, 255.0f));
    const unsigned char ClearG =
        static_cast<unsigned char>(std::clamp(ClearColour.Green * 255.0f + 0.5f, 0.0f, 255.0f));
    const unsigned char ClearB = static_cast<unsigned char>(std::clamp(ClearColour.Blue * 255.0f + 0.5f, 0.0f, 255.0f));
    for (size_t Index = 0; Index < Output.Pixels.size(); Index += 3u)
    {
        Output.Pixels[Index + 0u] = ClearR;
        Output.Pixels[Index + 1u] = ClearG;
        Output.Pixels[Index + 2u] = ClearB;
    }

    const ImDrawData *DrawData = ImGui::GetDrawData();
    Require(DrawData != nullptr && DrawData->TotalVtxCount > 0, "ImGui frame produced no geometry");
    for (const ImDrawList *List : DrawData->CmdLists)
    {
        FrontierExhibit::RasterizeCommands(List, Output.Pixels.data(), Width, Height, DrawData->DisplayPos,
                                           DrawData->FramebufferScale);
    }
    return Output;
}

void WritePngCapture(const RasterizedCapture &Capture, const std::filesystem::path &Destination)
{
    std::filesystem::create_directories(Destination.parent_path());
    const int Wrote = stbi_write_png(Destination.string().c_str(), Capture.Width, Capture.Height, 3,
                                     Capture.Pixels.data(), Capture.Width * 3);
    Require(Wrote != 0, "Failed to write PNG exhibit image");
}

double MeanRegionLuminance(const RasterizedCapture &Capture, int X0, int Y0, int X1, int Y1)
{
    double   Sum   = 0.0;
    uint64_t Count = 0;
    for (int Y = std::max(0, Y0); Y < std::min(Capture.Height, Y1); ++Y)
    {
        for (int X = std::max(0, X0); X < std::min(Capture.Width, X1); ++X)
        {
            const size_t Offset = (static_cast<size_t>(Y) * static_cast<size_t>(Capture.Width) + static_cast<size_t>(X)) * 3u;
            const double R      = Capture.Pixels[Offset + 0u] / 255.0;
            const double G      = Capture.Pixels[Offset + 1u] / 255.0;
            const double B      = Capture.Pixels[Offset + 2u] / 255.0;
            Sum += 0.2126 * R + 0.7152 * G + 0.0722 * B;
            ++Count;
        }
    }
    return Count > 0 ? (Sum / static_cast<double>(Count)) : 0.0;
}

void CopyFileClean(const std::filesystem::path &Source, const std::filesystem::path &Target)
{
    std::filesystem::create_directories(Target.parent_path());
    std::filesystem::copy_file(Source, Target, std::filesystem::copy_options::overwrite_existing);
}

} // namespace

int main(int ArgumentCount, char **Arguments)
{
    try
    {
        Require(ArgumentCount == 4,
                "Expected <RepositoryRoot> <ScratchEvidenceDirectory> <RetainedExhibitImagesDirectory>");
        const std::filesystem::path RepositoryRoot = std::filesystem::absolute(Arguments[1]);
        const std::filesystem::path ScratchDir     = std::filesystem::absolute(Arguments[2]);
        const std::filesystem::path ExhibitImages  = std::filesystem::absolute(Arguments[3]);

        std::filesystem::remove_all(ScratchDir);
        std::filesystem::create_directories(ScratchDir);
        std::filesystem::create_directories(ExhibitImages);

        // Work against a disposable copy of Project-Everest for preference/layout writes so browsing and
        // theme-switching tests never mutate the tracked repository files during CTest runs.
        const std::filesystem::path SourceEverestDir = RepositoryRoot / "Frontier/Projects/Project-Everest";
        const std::filesystem::path StagedProjects   = ScratchDir / "Projects";
        const std::filesystem::path StagedEverestDir = StagedProjects / "Project-Everest";
        CopyFileClean(SourceEverestDir / "ProjectEverest.projectspace",
                      StagedEverestDir / "ProjectEverest.projectspace");
        CopyFileClean(SourceEverestDir / "ProjectEverest.frontier", StagedEverestDir / "ProjectEverest.frontier");
        CopyFileClean(SourceEverestDir / "README.md", StagedEverestDir / "README.md");

        const std::filesystem::path PersonalPrefs = ScratchDir / "Personal.projectspace";
        const std::filesystem::path BrowserPrefs  = ScratchDir / "BrowserPrefs.toml";

        constexpr int Width  = 1920;
        constexpr int Height = 1080;

        ImGui::CreateContext();
        ImGuiIO &IO    = ImGui::GetIO();
        IO.IniFilename = nullptr;
        IO.DisplaySize = ImVec2(static_cast<float>(Width), static_cast<float>(Height));
        IO.DeltaTime   = 1.0f / 60.0f;
        IO.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
        IO.BackendFlags |= ImGuiBackendFlags_RendererHasTextures | ImGuiBackendFlags_RendererHasVtxOffset;
        ImGui::GetPlatformIO().Renderer_TextureMaxWidth  = 4096;
        ImGui::GetPlatformIO().Renderer_TextureMaxHeight = 4096;

        IconPresentation::Attach(RepositoryRoot / "EngineContent/Icons");

        ActivationOwnership Ownership(
            new ControlCentrePanel(RepositoryRoot / "EngineContent/FontArchives", PersonalPrefs));
        auto *Centre = static_cast<ControlCentrePanel *>(Ownership.get());
        Require(Centre->Initialize() && Centre->Activate(), "ControlCentrePanel failed to initialize");

        // 1. Project Browser discovery & filter to Application Projects.
        auto Browser = std::make_unique<ProjectBrowserPanel>();
        Browser->ConfigurePreferences(BrowserPrefs);
        const size_t DiscoveredCount = Browser->AttachProjectDirectory(StagedProjects);
        Require(DiscoveredCount == 1, "AttachProjectDirectory must discover Project Everest");

        const auto ProjectTitles = Browser->QueryFilteredTitles("project", "", false);
        Require(!ProjectTitles.empty() && ProjectTitles.front() == "Project Everest",
                "Project Everest must lead the Projects filter");

        const auto PumpBrowserFrames = [&](int Count) {
            for (int Index = 0; Index < Count; ++Index)
            {
                Centre->PrepareInterface();
                ImGui::NewFrame();
                Browser->ConfigurePalette(ControlKit::Palette());
                Browser->ConstructInterface();
                ImGui::Render();
                FrontierExhibit::AcknowledgeTextures();
            }
        };

        Browser->ConfigureFilter("project");
        PumpBrowserFrames(4);
        const RasterizedCapture BrowserLibraryCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(BrowserLibraryCapture, ExhibitImages / "01_ProjectBrowser_Projects.png");

        // 2. Open Project Everest in Reader -> Open Application Selection modal ("Open in Frontier").
        Require(Browser->OpenEntry("project-project-everest"), "OpenEntry must open Project Everest");
        Browser->ConfigureApplicationTarget(BrowserApplicationTarget::ProjectWorkspace);
        Browser->OpenApplicationPrompt();
        PumpBrowserFrames(4);
        const RasterizedCapture SelectAppCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(SelectAppCapture, ExhibitImages / "02_ProjectBrowser_SelectApplication.png");

        // 3. Confirm Application Launch -> consume hand-off path -> activate Project Everest workspace!
        Require(Browser->ConfirmApplicationLaunch(), "ConfirmApplicationLaunch must validate and stage LaunchPath");
        const std::filesystem::path LaunchedPath = Browser->ConsumeLaunchPath();
        Require(LaunchedPath == StagedEverestDir / "ProjectEverest.projectspace",
                "ConsumeLaunchPath must return ProjectEverest.projectspace");
        Require(Browser->ConsumeLaunchPath().empty(), "ConsumeLaunchPath must be single-consumption");

        ProjectSpaceDocument DecodedEverest;
        std::string          DecodeDiagnostic;
        Require(ProjectSpaceCodec::Decode(LaunchedPath, DecodedEverest, DecodeDiagnostic),
                "ProjectEverest.projectspace must decode cleanly");

        const BrowserApplicationTarget ChosenApp = Browser->QueryApplicationTarget();
        Browser.reset();

        Ownership.reset(
            new ControlCentrePanel(RepositoryRoot / "EngineContent/FontArchives", PersonalPrefs, LaunchedPath));
        Centre = static_cast<ControlCentrePanel *>(Ownership.get());
        Require(Centre->Initialize() && Centre->Activate(), "Project Everest ControlCentrePanel activation failed");

        auto Workspace = std::make_unique<EditorWorkspace>(*Centre);
        EditorProjectSummary Summary;
        Summary.Name              = DecodedEverest.Sections["project"]["name"].value_or(std::string("Project"));
        Summary.Location          = "Frontier/Projects/Project-Everest/ProjectEverest.projectspace";
        Summary.Identity          = DecodedEverest.Sections["project"]["identity"].value_or(std::string{});
        Summary.ApplicationTarget = BrowserApplicationLabel(ChosenApp);
        if (const auto *Levels = DecodedEverest.Sections["levels"].as_array()) Summary.Levels = Levels->size();
        if (const auto *Roots = DecodedEverest.Sections["content_roots"].as_array()) Summary.Roots = Roots->size();
        if (const auto *Catalogue = DecodedEverest.Sections["catalogue"].as_array()) Summary.Catalogue = Catalogue->size();
        Summary.StartupLevel = DecodedEverest.Sections["engine"]["startup_level"].value_or(std::string{});
        Require(Summary.Name == "Project Everest" && Summary.StartupLevel == "ProvingGrounds",
                "Decoded Project Everest summary mismatch");

        bool ReturnToBrowserTriggered = false;
        Workspace->ConfigureProject(std::move(Summary));
        Workspace->EvaluateReturnToBrowser = [&]() { ReturnToBrowserTriggered = true; };
        Workspace->ActivateProjectWorkspace(LaunchedPath, true);
        (void)ReturnToBrowserTriggered;

        // Verify declared user log categories from ProjectEverest.frontier are registered.
        for (const char *CategoryName : {"Powertrain", "CabinHMI", "Weather", "Fracture"})
        {
            const LogCategory *Registered = LogCategories().QueryByName(CategoryName);
            Require(Registered != nullptr && Registered->UserCreated,
                    "Declared Project Everest log category missing from LogCategoryRegistry");
        }

        // Verify RecordEntry constructor/destructor auto-registration in SceneDirectory (Outliner).
        Require(SceneDirectory::Instance().QueryCount() == 5u,
                "Project Everest opening scene must register 5 initial SceneRecord instances");
        {
            SceneRecord EphemeralFractureBody(RecordClassification::Geometry);
            (void)SceneDirectory::Instance().ConfigureName(EphemeralFractureBody.Token(), "Test Fracture Specimen");
            Require(SceneDirectory::Instance().QueryCount() == 6u,
                    "RecordEntry constructor must auto-register in SceneDirectory");
        }
        Require(SceneDirectory::Instance().QueryCount() == 5u,
                "RecordEntry destructor must auto-unregister from SceneDirectory");

        // Emit one expandable diagnostic error entry as well so severity chips, counts, and detail expansion are live.
        if (const LogCategory *RenderCat = LogCategories().QueryByName("Render"))
        {
            WriteLog(RenderCat->Token, LogSeverity::Error, LogVerbosity::Display,
                     "Scene renderer dispatches deferred until Phase 2 · UI host & LogStream verified active",
                     "ProjectEverestValidation.cpp:208");
        }

        const auto PumpWorkspaceFrames = [&](int Count) {
            for (int Index = 0; Index < Count; ++Index)
            {
                Centre->PrepareInterface();
                (void)Workspace->ConfigurePlatform();
                ImGui::NewFrame();
                (void)Centre->Integrate(1.0 / 60.0);
                Workspace->ConstructInterface();
                Centre->ConstructInterface();
                ImGui::Render();
                FrontierExhibit::AcknowledgeTextures();
                Workspace->IntegrateLayoutPersistence(1.0 / 60.0);
            }
        };

        PumpWorkspaceFrames(12);
        {
            ImGuiWindow *OutlinerWindow = ImGui::FindWindowByName("Outliner###FrontierPanel-Outliner");
            ImGuiWindow *ViewportWindow = ImGui::FindWindowByName("Viewport###FrontierPanel-viewport");
            ImGuiWindow *LogWindow      = ImGui::FindWindowByName("Log Stream###FrontierPanel-LogStream");
            Require(OutlinerWindow != nullptr && ViewportWindow != nullptr && LogWindow != nullptr,
                    "Docked Outliner, Viewport, or LogStream ImGui window missing");
            Require(OutlinerWindow->Pos.x + 80.0f < ViewportWindow->Pos.x &&
                        ViewportWindow->Pos.x + 80.0f < LogWindow->Pos.x && LogWindow->Size.x >= 720.0f,
                    "Expected side-by-side 3-column dock split (Outliner | Viewport | Log Stream)");
        }
        // Select the error row so the inline detail inspector in LogStreamPanel is also exercised visually.
        if (Workspace->QueryLogStreamPanel().QueryVisible().size() > 0)
        {
            Workspace->QueryLogStreamPanel().SelectVisible(Workspace->QueryLogStreamPanel().QueryVisible().size() - 1u);
        }
        PumpWorkspaceFrames(4);
        const RasterizedCapture OledWorkspaceCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(OledWorkspaceCapture, ExhibitImages / "03_ProjectEverest_Workspace_OLED.png");

        // 4. Open ControlCentrePanel top-edge drawer on Appearance -> Theme page over Project Everest.
        Centre->ActivatePage(AppearancePageCategory::Theme);
        PumpWorkspaceFrames(60);
        const RasterizedCapture ControlCentreDrawerCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(ControlCentreDrawerCapture,
                        ExhibitImages / "04_ProjectEverest_ControlCentre_ThemeDrawer.png");

        // 5. Switch UI Theme to Light via ControlCentrePanel and dismiss the drawer; verify real luminance shift.
        {
            auto Draft  = Centre->QueryAppearance().QueryDraft();
            Draft.Theme = ThemeCategory::Light;
            Centre->QueryAppearance().ConfigureDraft(Draft);
            Centre->QueryAppearance().Apply();
            IO.AddKeyEvent(ImGuiKey_Escape, true);
            PumpWorkspaceFrames(2);
            IO.AddKeyEvent(ImGuiKey_Escape, false);
            PumpWorkspaceFrames(60);
        }
        const RasterizedCapture LightWorkspaceCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(LightWorkspaceCapture, ExhibitImages / "05_ProjectEverest_Workspace_LightTheme.png");

        const double OledLogLuminance  = MeanRegionLuminance(OledWorkspaceCapture, 1150, 220, 1880, 960);
        const double LightLogLuminance = MeanRegionLuminance(LightWorkspaceCapture, 1150, 220, 1880, 960);
        const double OledOutlinerLum   = MeanRegionLuminance(OledWorkspaceCapture, 30, 160, 360, 960);
        const double LightOutlinerLum  = MeanRegionLuminance(LightWorkspaceCapture, 30, 160, 360, 960);
        Require(OledLogLuminance < 0.18 && LightLogLuminance > 0.72,
                "ControlCentre Theme switch must re-theme LogStreamPanel from dark OLED to Light");
        Require(OledOutlinerLum < 0.18 && LightOutlinerLum > 0.72,
                "ControlCentre Theme switch must re-theme SceneDirectoryPanel Outliner from dark OLED to Light");

        // 6. Switch UI Theme to Sepia via ControlCentrePanel and open the Channels DropdownControlSurface in LogStream.
        {
            auto Draft  = Centre->QueryAppearance().QueryDraft();
            Draft.Theme = ThemeCategory::Sepia;
            Centre->QueryAppearance().ConfigureDraft(Draft);
            Centre->QueryAppearance().Apply();
            PumpWorkspaceFrames(6);

            // Open the reusable Channels DropdownControlSurface popup inside a live LogStream frame.
            Centre->PrepareInterface();
            (void)Workspace->ConfigurePlatform();
            ImGui::NewFrame();
            (void)Centre->Integrate(1.0 / 60.0);
            Workspace->ConstructInterface();
            if (ImGuiWindow *LogWindow = ImGui::FindWindowByName("Log Stream###FrontierPanel-LogStream"))
            {
                ImGui::OpenPopupEx(LogWindow->GetID("##LogChannelsPopup"), ImGuiPopupFlags_None);
            }
            Centre->ConstructInterface();
            ImGui::Render();
            FrontierExhibit::AcknowledgeTextures();
            PumpWorkspaceFrames(4);
        }
        const RasterizedCapture SepiaChannelsCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(SepiaChannelsCapture, ExhibitImages / "06_ProjectEverest_Workspace_SepiaChannels.png");

        // Tear down workspace and verify all 5 opening-scene RecordEntry objects unregistered cleanly.
        Workspace.reset();
        Require(SceneDirectory::Instance().QueryCount() == 0u,
                "Destroying EditorWorkspace must unregister all owned SceneRecord entries");

        Ownership.reset();
        ImGui::DestroyContext();

        const std::filesystem::path ReportPath =
            RepositoryRoot / "Exhibits/ProjectEverest/Results/ProjectEverestChecks.json";
        std::filesystem::create_directories(ReportPath.parent_path());
        std::ofstream Report(ReportPath, std::ios::trunc);
        Report << "{\n"
               << "  \"result\": \"passed\",\n"
               << "  \"project\": \"Project Everest\",\n"
               << "  \"application_target\": \"Frontier · Project workspace\",\n"
               << "  \"startup_scene\": \"ProvingGrounds\",\n"
               << "  \"user_log_categories\": [\"Powertrain\", \"CabinHMI\", \"Weather\", \"Fracture\"],\n"
               << "  \"oled_logstream_luminance\": " << OledLogLuminance << ",\n"
               << "  \"light_logstream_luminance\": " << LightLogLuminance << ",\n"
               << "  \"oled_outliner_luminance\": " << OledOutlinerLum << ",\n"
               << "  \"light_outliner_luminance\": " << LightOutlinerLum << ",\n"
               << "  \"captures\": [\n"
               << "    \"Exhibits/ProjectEverest/Images/01_ProjectBrowser_Projects.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/02_ProjectBrowser_SelectApplication.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/03_ProjectEverest_Workspace_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/04_ProjectEverest_ControlCentre_ThemeDrawer.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/05_ProjectEverest_Workspace_LightTheme.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/06_ProjectEverest_Workspace_SepiaChannels.png\"\n"
               << "  ]\n"
               << "}\n";

        std::cout << "PASS: Project Everest browser discovery, application selection, docked LogStream + Outliner + "
                     "ControlCentre theme switching (OLED lum="
                  << OledLogLuminance << " -> Light lum=" << LightLogLuminance << ")\n";
        return 0;
    }
    catch (const std::exception &Failure)
    {
        if (ImGui::GetCurrentContext() != nullptr)
        {
            ImGui::DestroyContext();
        }
        std::cerr << "FAIL: " << Failure.what() << '\n';
        return 1;
    }
}
