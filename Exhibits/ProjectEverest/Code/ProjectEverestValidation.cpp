/*==========================================================================================================================================
                                                      PROJECTEVERESTVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 End-to-end validation and native CPU exhibit capture for Frontier -> Project Browser -> Select Application ->
//    Project Everest -> docked EditorWorkspace (PanelDockspace + ControlCentrePanel UI theme controller +
//    shared Inspector + SceneDirectoryPanel Outliner + RecordEntry constructor/destructor lifecycle).

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>

#include "Engine/Diagnostics/LogCategories.h"
#include "Engine/Diagnostics/LogStream.h"
#include "Engine/Interface/ControlKit.h"
#include "Engine/Interface/IconPresentation.h"
#include "Engine/Scene/SceneDirectory.h"
#include "Engine/Scene/GlobalEnvironmentRecords.h"
#include "Engine/Scene/RecordInspectorRegistry.h"
#include "Engine/Scene/SceneRecord.h"
#include "Exhibits/ControlCentre/Code/CpuRasterization.h"
#include "UI/Editor/ControlCentrePanel.h"
#include "UI/Editor/EditorWorkspace.h"
#include "UI/Editor/ProjectBrowserPanel.h"

#include <imgui.h>
#include <imgui_internal.h>

#include <algorithm>
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

void VerifyWindInspectorSourcePort()
{
    WindFieldRecord Wind;
    Wind.BaseSpeedMps = 7.0;
    Wind.TravelBearingDegrees = 90.0;
    Wind.GustStrength = 0.25;
    const double Phase = 2.4;
    const double ExpectedFactor = 1.0 + 0.25 * (0.65 * std::sin(Phase) + 0.35 * std::sin(Phase * 2.17));
    Require(std::abs(Wind.EvaluateTwoSineGustFactor(Phase) - ExpectedFactor) < 1.0e-12,
            "Wind gust reference must match the source's fixed-phase two-sine envelope");
    Require(std::abs(Wind.QueryMeteorologicalSourceDegrees() - 270.0) < 1.0e-12,
            "Wind bearing display must remain meteorological FROM while the field stores travel TO");
    double Speed = 0.0, Bearing = 0.0;
    Wind.AltitudeShearPerKm = 0.15;
    Wind.AltitudeVeerDegreesPerKm = 8.0;
    Wind.EvaluateAltitudeVector(3000.0, Speed, Bearing);
    Require(std::abs(Speed - 10.15) < 1.0e-12 && std::abs(Bearing - 114.0) < 1.0e-12,
            "Wind altitude ladder must match source steady shear and veer equations");
}

void VerifyAtmosphereInspectorBindings()
{
    AtmosphereRecord Atmosphere;
    Atmosphere.SynchronizeAtmosphereParameters(true);
    const SpectrumRgb Reference = Atmosphere.EvaluateSolarTransmittance(26.5, 145.0);
    Atmosphere.AirMassEnabled = false;
    const SpectrumRgb Bypassed = Atmosphere.EvaluateSolarTransmittance(26.5, 145.0);
    Require(Bypassed.R == 1.0 && Bypassed.G == 1.0 && Bypassed.B == 1.0,
            "Atmosphere air-mass toggle must bypass direct-light attenuation");
    Atmosphere.AirMassEnabled = true;
    Atmosphere.SkyBrightnessScale = 2.0;
    Atmosphere.SkyTintRgb = {1.0, 0.5, 0.25};
    Atmosphere.SynchronizeAtmosphereParameters(false);
    const SpectrumRgb Tinted = Atmosphere.SampleSkyPanorama(0.7, 0.3, 26.5, 145.0);
    Atmosphere.SkyBrightnessScale = 1.0;
    Atmosphere.SkyTintRgb = {1.0, 1.0, 1.0};
    Atmosphere.SynchronizeAtmosphereParameters(false);
    const SpectrumRgb Untinted = Atmosphere.SampleSkyPanorama(0.7, 0.3, 26.5, 145.0);
    Require(std::abs(Tinted.R - Untinted.R * 2.0) < 1.0e-9 &&
                std::abs(Tinted.G - Untinted.G) < 1.0e-9 &&
                std::abs(Tinted.B - Untinted.B * 0.5) < 1.0e-9,
            "Atmosphere tint wells and brightness slider must reach the CPU reference model");
    (void)Reference;
}

void VerifySolarInspectorSourcePort()
{
    SunRecord Sun;
    Require(Sun.SolarClockHours == 12.0 && Sun.CycleDurationHours == 6.0 &&
                Sun.CalendarDateIso == "2026-10-20",
            "Sun inspector defaults must match the VehicleHMI celestial settings");

    Sun.RecomputeFromEphemeris();
    Require(std::abs(Sun.AzimuthDegrees - 97.61628953892796) < 1.0e-8 &&
                std::abs(Sun.ElevationDegrees - 74.10762841148737) < 1.0e-8,
            "Sun position solver must match the VehicleHMI celestial solver reference fixture");
    const DailySolarCurveSummary Curve = Sun.EvaluateDailyElevationCurve();
    Require(std::abs(Curve.ElevationSamplesDegrees[48] - 74.10762841148737) < 1.0e-8,
            "Solar day curve must use the source solver at local noon");

    Sun.DayCycleEnabled = true;
    Require(Sun.SetInspectorValue(SunInspectorValue::Azimuth, 200.0) && Sun.AzimuthDegrees == 180.0 &&
                !Sun.AutomaticPlacementEnabled && !Sun.DayCycleEnabled,
            "Manual azimuth edits must clamp and stop automatic placement and the day cycle");
    Require(Sun.SetInspectorValue(SunInspectorValue::SolarTime, 25.0) && Sun.SolarClockHours == 24.0 &&
                Sun.AutomaticPlacementEnabled,
            "Solar time edits must clamp and return to ephemeris-linked placement");
    Require(Sun.SetInspectorValue(SunInspectorValue::ColourTemperature, 12000.0) &&
                Sun.ColourTemperatureKelvin == 10000.0 && Sun.TemperatureModeEnabled,
            "Temperature edits must clamp and select the temperature colour source");
    Sun.SetCustomTint(0.2, 0.4, 1.2);
    Require(!Sun.TemperatureModeEnabled && std::abs(Sun.CustomTintRed - 0.2) < 1.0e-12 &&
                std::abs(Sun.CustomTintGreen - 0.4) < 1.0e-12 && Sun.CustomTintBlue == 1.0,
            "Custom RGB tint edits must clamp channels and select RGB colour mode");
    const std::string RetainedDate = Sun.CalendarDateIso;
    Sun.SetCalendarDate("2026-02-30");
    Require(Sun.CalendarDateIso == RetainedDate, "Invalid solar calendar dates must not mutate the record");
    Sun.SetCalendarDate("2026-12-21");
    Require(Sun.CalendarDateIso == "2026-12-21" && Sun.AutomaticPlacementEnabled,
            "A valid solar calendar date must enable and recompute automatic placement");

    Sun.ApplyLightingPreset(1);
    Require(Sun.LightingPresetIndex == 1 && Sun.ElevationDegrees == 10.0 && Sun.AzimuthDegrees == 160.0 &&
                Sun.SolarIlluminance == 12.0 && !Sun.DayCycleEnabled,
            "Golden preset must match the VehicleHMI lighting preset");
    Sun.SunlightEnabled = false;
    Sun.SolarDiscEnabled = false;
    Sun.SolarClockHours = 9.0;
    Sun.ResetDefaults();
    Require(!Sun.SunlightEnabled && !Sun.SolarDiscEnabled && Sun.SolarClockHours == 9.0 &&
                Sun.ElevationDegrees == 38.0 && Sun.AzimuthDegrees == 145.0 && !Sun.AutomaticPlacementEnabled &&
                Sun.TemperatureModeEnabled,
            "Sun reset must match the source action without resetting unrelated tiles or time");
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

        VerifySolarInspectorSourcePort();
        VerifyWindInspectorSourcePort();
        VerifyAtmosphereInspectorBindings();

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
        auto AppearanceDraft = Centre->QueryAppearance().QueryDraft();
        AppearanceDraft.Theme = ThemeCategory::Oled;
        Centre->QueryAppearance().ConfigureDraft(AppearanceDraft);
        Centre->QueryAppearance().Apply();

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
        Require(SceneDirectory::Instance().QueryCount() == 10u && RecordInspectorRegistry::Instance().QueryCount() == 10u,
                "Project Everest must auto-register its ten initial records in both Outliner and Inspector registry");
        uint32_t EnvironmentInspectorTally = 0;
        const SunRecord *SeededSun = nullptr;
        std::vector<RecordToken> InitialTokens;
        SceneDirectory::Instance().CopyRegistrationOrder(InitialTokens);
        for (const RecordToken Token : InitialTokens)
        {
            const auto Descriptor = RecordInspectorRegistry::Instance().Query(Token);
            if (Descriptor && Descriptor->Domain != GlobalInspectorDomain::GenericRecord)
                ++EnvironmentInspectorTally;
            if (Descriptor && Descriptor->Domain == GlobalInspectorDomain::Sun)
                SeededSun = static_cast<const SunRecord *>(Descriptor->PayloadAddress);
        }
        Require(EnvironmentInspectorTally == 6u,
                "Folder, Sun, Lens Flare, Clouds, Wind, and Atmosphere must bind global Engine Inspectors");
        const auto LinkedFlare = SeededSun != nullptr && SeededSun->LinkedLensFlareToken.IsValid()
                                     ? RecordInspectorRegistry::Instance().Query(SeededSun->LinkedLensFlareToken)
                                     : std::nullopt;
        Require(LinkedFlare.has_value() && LinkedFlare->Domain == GlobalInspectorDomain::LensFlare,
                "Sun inspector optics link must resolve to its nested Lens Flare record");
        {
            SceneRecord EphemeralFractureBody(RecordClassification::Geometry);
            (void)SceneDirectory::Instance().ConfigureName(EphemeralFractureBody.Token(), "Test Fracture Specimen");
            Require(SceneDirectory::Instance().QueryCount() == 11u &&
                        RecordInspectorRegistry::Instance().QueryRegistered(EphemeralFractureBody.Token()),
                    "RecordEntry constructor must auto-register in both SceneDirectory and Inspector registry");
        }
        Require(SceneDirectory::Instance().QueryCount() == 10u && RecordInspectorRegistry::Instance().QueryCount() == 10u,
                "RecordEntry destructor must auto-unregister from SceneDirectory and Inspector registry");

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
            ImGuiWindow *OutlinerWindow  = ImGui::FindWindowByName("Outliner###FrontierPanel-Outliner");
            ImGuiWindow *ViewportWindow  = ImGui::FindWindowByName("Viewport###FrontierPanel-viewport");
            ImGuiWindow *LogWindow       = ImGui::FindWindowByName("Log Stream###FrontierPanel-LogStream");
            ImGuiWindow *InspectorWindow = ImGui::FindWindowByName("Inspector###FrontierPanel-Inspector");
            Require(OutlinerWindow != nullptr && ViewportWindow != nullptr && InspectorWindow != nullptr,
                    "Docked Outliner, Viewport, or shared Inspector ImGui window missing");
            Require(!Workspace->QueryPanels().QueryOpen("LogStream") && LogWindow == nullptr,
                    "Log Stream must remain hidden from the Project Everest workspace");
            Require(OutlinerWindow->Pos.x + 80.0f < ViewportWindow->Pos.x &&
                        ViewportWindow->Pos.x + 80.0f < InspectorWindow->Pos.x && InspectorWindow->Size.x >= 400.0f,
                    "Expected Outliner | Viewport | one full-height Inspector dock split");
        }
        ImGuiWindow *SharedInspectorWindow = ImGui::FindWindowByName("Inspector###FrontierPanel-Inspector");
        PumpWorkspaceFrames(4);
        const RasterizedCapture OledWorkspaceCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(OledWorkspaceCapture, ExhibitImages / "03_ProjectEverest_Workspace_OLED.png");

        const auto CaptureEnvironmentInspector = [&](const char* RecordName, const char* Filename,
                                                     GlobalInspectorDomain ExpectedDomain) {
            const auto& Rows = Workspace->QuerySceneDirectoryPanel().QueryRows();
            const auto SelectedRow = std::find_if(Rows.begin(), Rows.end(), [&](const SceneDirectoryRow& Row) {
                return Row.Name == RecordName;
            });
            Require(SelectedRow != Rows.end(), "Expected global environment record must appear in Outliner");
            const auto Descriptor = RecordInspectorRegistry::Instance().Query(SelectedRow->Token);
            Require(Descriptor.has_value() && Descriptor->Domain == ExpectedDomain,
                    "Global Engine environment record must bind its typed Inspector domain");
            Workspace->QuerySceneDirectoryPanel().Select(SelectedRow->Token);
            (void)Workspace->QueryPanels().ConfigureOpen("Inspector", true);
            PumpWorkspaceFrames(3);
            Require(ImGui::FindWindowByName("Inspector###FrontierPanel-Inspector") == SharedInspectorWindow,
                    "Changing selected record must reuse the single docked Inspector window");
            const RasterizedCapture Capture = RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
            WritePngCapture(Capture, ExhibitImages / Filename);
        };
        CaptureEnvironmentInspector("Environment", "07_ProjectEverest_FolderInspector_OLED.png",
                                    GlobalInspectorDomain::Folder);
        CaptureEnvironmentInspector("Lens Flare", "08_ProjectEverest_LensFlareInspector_OLED.png",
                                    GlobalInspectorDomain::LensFlare);
        {
            const auto& Rows = Workspace->QuerySceneDirectoryPanel().QueryRows();
            const auto Row = std::find_if(Rows.begin(), Rows.end(), [](const SceneDirectoryRow& Entry) {
                return Entry.Name == "Lens Flare";
            });
            Require(Row != Rows.end(), "Lens Flare tab exhibits require the Project Everest lens record");
            const auto Descriptor = RecordInspectorRegistry::Instance().Query(Row->Token);
            Require(Descriptor.has_value() && Descriptor->Domain == GlobalInspectorDomain::LensFlare,
                    "Lens Flare tab exhibits require their typed Inspector domain");
            auto *Flare = static_cast<LensFlareRecord *>(Descriptor->PayloadAddress);
            Flare->ActiveSectionIndex = 0;
            Workspace->QuerySceneDirectoryPanel().Select(Row->Token);
            (void)Workspace->QueryPanels().ConfigureOpen("Inspector", true);
            PumpWorkspaceFrames(3);
            const auto FindFlareTabContentWindow = []() -> ImGuiWindow * {
                for (ImGuiWindow *Window : ImGui::GetCurrentContext()->Windows)
                {
                    if (std::string(Window->Name).find("##flare_tab_content_") != std::string::npos)
                    {
                        return Window;
                    }
                }
                return nullptr;
            };
            IO.AddMousePosEvent(1200.0f, 850.0f);
            for (int32_t Tick = 0; Tick < 16; ++Tick)
            {
                IO.AddMouseWheelEvent(0.0f, -1.0f);
                PumpWorkspaceFrames(1);
            }
            ImGuiWindow *FlareTabContentWindow = FindFlareTabContentWindow();
            Require(FlareTabContentWindow != nullptr && FlareTabContentWindow->Scroll.y > 0.0f,
                    "Lens Flare tab content must respond to wheel scrolling");
            FlareTabContentWindow->ScrollTarget.y = FlareTabContentWindow->ScrollMax.y;
            IO.AddMousePosEvent(100.0f, 100.0f);
            PumpWorkspaceFrames(3);
            const std::array<std::pair<int32_t, const char *>, 4> Tabs{{
                {0, "26_ProjectEverest_LensFlareInspector_Compose_OLED.png"},
                {1, "27_ProjectEverest_LensFlareInspector_Ghosts_OLED.png"},
                {2, "28_ProjectEverest_LensFlareInspector_Halo_OLED.png"},
                {3, "29_ProjectEverest_LensFlareInspector_Rays_OLED.png"}}};
            for (const auto &[Section, Filename] : Tabs)
            {
                Flare->ActiveSectionIndex = Section;
                Workspace->QuerySceneDirectoryPanel().Select(Row->Token);
                (void)Workspace->QueryPanels().ConfigureOpen("Inspector", true);
                PumpWorkspaceFrames(3);
                FlareTabContentWindow = FindFlareTabContentWindow();
                Require(FlareTabContentWindow != nullptr,
                        "Each Lens Flare section must reuse the Inspector tab-content window");
                FlareTabContentWindow->ScrollTarget.y =
                    std::max(0.0f, FlareTabContentWindow->ScrollMax.y - 100.0f);
                PumpWorkspaceFrames(1);
                IO.AddMousePosEvent(1200.0f, 850.0f);
                for (int32_t Tick = 0; Tick < 4; ++Tick)
                {
                    IO.AddMouseWheelEvent(0.0f, -1.0f);
                    PumpWorkspaceFrames(1);
                }
                IO.AddMousePosEvent(100.0f, 100.0f);
                PumpWorkspaceFrames(1);
                Require(Flare->ActiveSectionIndex == Section,
                        "Lens Flare Inspector tab selection must persist while its native section renders");
                WritePngCapture(RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field),
                                ExhibitImages / Filename);
            }
            Flare->ActiveSectionIndex = 0;
            FlareTabContentWindow->ScrollTarget.y = 0.0f;
            PumpWorkspaceFrames(3);
        }
        CaptureEnvironmentInspector("Clouds", "09_ProjectEverest_CloudInspector_OLED.png",
                                    GlobalInspectorDomain::Clouds);
        CaptureEnvironmentInspector("Wind", "10_ProjectEverest_WindInspector_OLED.png",
                                    GlobalInspectorDomain::Wind);
        CaptureEnvironmentInspector("Atmosphere", "11_ProjectEverest_AtmosphereInspector_OLED.png",
                                    GlobalInspectorDomain::Atmosphere);
        {
            const auto& Rows = Workspace->QuerySceneDirectoryPanel().QueryRows();
            const auto Row = std::find_if(Rows.begin(), Rows.end(), [](const SceneDirectoryRow& Entry) {
                return Entry.Name == "Clouds";
            });
            Require(Row != Rows.end(), "Cloud tab exhibits require the Project Everest cloud record");
            const auto Descriptor = RecordInspectorRegistry::Instance().Query(Row->Token);
            Require(Descriptor.has_value() && Descriptor->Domain == GlobalInspectorDomain::Clouds,
                    "Cloud tab exhibits require their typed Inspector domain");
            auto *Clouds = static_cast<CloudLayerRecord *>(Descriptor->PayloadAddress);
            const std::array<std::pair<int32_t, const char *>, 3> Tabs{{
                {1, "20_ProjectEverest_CloudInspector_Formation_OLED.png"},
                {2, "21_ProjectEverest_CloudInspector_Rendering_OLED.png"},
                {3, "22_ProjectEverest_CloudInspector_Weather_OLED.png"}}};
            for (const auto &[Section, Filename] : Tabs)
            {
                Clouds->ActiveSectionIndex = Section;
                Workspace->QuerySceneDirectoryPanel().Select(Row->Token);
                (void)Workspace->QueryPanels().ConfigureOpen("Inspector", true);
                PumpWorkspaceFrames(3);
                Require(Clouds->ActiveSectionIndex == Section,
                        "Cloud Inspector tab selection must persist while its native section renders");
                WritePngCapture(RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field),
                                ExhibitImages / Filename);
            }
            Clouds->ActiveSectionIndex = 0;
            PumpWorkspaceFrames(3);
        }
        {
            const auto& Rows = Workspace->QuerySceneDirectoryPanel().QueryRows();
            const auto Row = std::find_if(Rows.begin(), Rows.end(), [](const SceneDirectoryRow& Entry) {
                return Entry.Name == "Wind";
            });
            Require(Row != Rows.end(), "Wind tab exhibits require the Project Everest wind record");
            const auto Descriptor = RecordInspectorRegistry::Instance().Query(Row->Token);
            Require(Descriptor.has_value() && Descriptor->Domain == GlobalInspectorDomain::Wind,
                    "Wind tab exhibits require their typed Inspector domain");
            auto *Wind = static_cast<WindFieldRecord *>(Descriptor->PayloadAddress);
            const std::array<std::pair<int32_t, const char *>, 3> Tabs{{
                {1, "23_ProjectEverest_WindInspector_Variability_OLED.png"},
                {2, "24_ProjectEverest_WindInspector_Altitude_OLED.png"},
                {3, "25_ProjectEverest_WindInspector_Receivers_OLED.png"}}};
            for (const auto &[Section, Filename] : Tabs)
            {
                Wind->ActiveSectionIndex = Section;
                Workspace->QuerySceneDirectoryPanel().Select(Row->Token);
                (void)Workspace->QueryPanels().ConfigureOpen("Inspector", true);
                PumpWorkspaceFrames(3);
                Require(Wind->ActiveSectionIndex == Section,
                        "Wind Inspector tab selection must persist while its native section renders");
                WritePngCapture(RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field),
                                ExhibitImages / Filename);
            }
            Wind->ActiveSectionIndex = 0;
            PumpWorkspaceFrames(3);
        }
        {
            const auto& Rows = Workspace->QuerySceneDirectoryPanel().QueryRows();
            const auto AtmosphereRow = std::find_if(Rows.begin(), Rows.end(), [](const SceneDirectoryRow& Row) {
                return Row.Name == "Atmosphere";
            });
            Require(AtmosphereRow != Rows.end(), "Atmosphere tab exhibits require the Project Everest atmosphere record");
            const auto AtmosphereDescriptor = RecordInspectorRegistry::Instance().Query(AtmosphereRow->Token);
            Require(AtmosphereDescriptor.has_value() && AtmosphereDescriptor->Domain == GlobalInspectorDomain::Atmosphere,
                    "Atmosphere tab exhibits require its typed Inspector domain");
            auto *Atmosphere = static_cast<AtmosphereRecord *>(AtmosphereDescriptor->PayloadAddress);
            Workspace->QuerySceneDirectoryPanel().Select(AtmosphereRow->Token);
            (void)Workspace->QueryPanels().ConfigureOpen("Inspector", true);
            PumpWorkspaceFrames(3);
            const std::array<std::pair<int32_t, const char *>, 3> AtmosphereTabs{{
                {1, "16_ProjectEverest_AtmosphereInspector_Medium_OLED.png"},
                {2, "17_ProjectEverest_AtmosphereInspector_LightResponse_OLED.png"},
                {3, "18_ProjectEverest_AtmosphereInspector_Baking_OLED.png"}}};
            for (const auto &[Section, Filename] : AtmosphereTabs)
            {
                Atmosphere->ActiveSectionIndex = Section;
                PumpWorkspaceFrames(3);
                Require(Atmosphere->ActiveSectionIndex == Section,
                        "Atmosphere Inspector tab selection must persist while its native section renders");
                WritePngCapture(RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field),
                                ExhibitImages / Filename);
            }
            Atmosphere->ActiveSectionIndex = 1;
            PumpWorkspaceFrames(3);
            IO.AddMousePosEvent(1200.0f, 850.0f);
            for (int32_t Tick = 0; Tick < 16; ++Tick)
            {
                IO.AddMouseWheelEvent(0.0f, -1.0f);
                PumpWorkspaceFrames(1);
            }
            bool MediumContentFound = false;
            for (ImGuiWindow *Window : GImGui->Windows)
                if (std::strstr(Window->Name, "atmosphere_tab_content") != nullptr && Window->Scroll.y > 0.0f)
                    MediumContentFound = true;
            Require(MediumContentFound, "Mouse-wheel scrolling must reveal the lower Medium Inspector controls");
            WritePngCapture(RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field),
                            ExhibitImages / "19_ProjectEverest_AtmosphereInspector_MediumControls_OLED.png");
            Atmosphere->ActiveSectionIndex = 0;
            PumpWorkspaceFrames(3);
        }
        CaptureEnvironmentInspector("Sun", "12_ProjectEverest_SunInspector_OLED.png",
                                    GlobalInspectorDomain::Sun);
        {
            const auto &Rows = Workspace->QuerySceneDirectoryPanel().QueryRows();
            const auto SunRow = std::find_if(Rows.begin(), Rows.end(), [](const SceneDirectoryRow &Row) {
                return Row.Name == "Sun";
            });
            Require(SunRow != Rows.end(), "Sun tab exhibit requires the Project Everest Sun record");
            const auto SunDescriptor = RecordInspectorRegistry::Instance().Query(SunRow->Token);
            Require(SunDescriptor.has_value() && SunDescriptor->Domain == GlobalInspectorDomain::Sun,
                    "Sun tab exhibit requires its source-mapped Solar Inspector");
            auto *Sun = static_cast<SunRecord *>(SunDescriptor->PayloadAddress);
            const std::array<std::pair<int32_t, const char *>, 3> SunTabs{{
                {1, "13_ProjectEverest_SunInspector_Daylight_OLED.png"},
                {2, "14_ProjectEverest_SunInspector_LightColour_OLED.png"},
                {3, "15_ProjectEverest_SunInspector_DiscOptics_OLED.png"}}};
            for (const auto &[Section, Filename] : SunTabs)
            {
                Sun->ActiveSectionIndex = Section;
                PumpWorkspaceFrames(3);
                Require(Sun->ActiveSectionIndex == Section,
                        "Sun Inspector tab selection must persist while its native page renders");
                WritePngCapture(RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field),
                                ExhibitImages / Filename);
            }
            Sun->ActiveSectionIndex = 0;
            PumpWorkspaceFrames(3);
        }

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

        const double OledOutlinerLum   = MeanRegionLuminance(OledWorkspaceCapture, 30, 160, 360, 960);
        const double LightOutlinerLum  = MeanRegionLuminance(LightWorkspaceCapture, 30, 160, 360, 960);
        const double OledInspectorLum  = MeanRegionLuminance(OledWorkspaceCapture, 1120, 120, 1545, 860);
        const double LightInspectorLum = MeanRegionLuminance(LightWorkspaceCapture, 1120, 120, 1545, 860);
        Require(OledOutlinerLum < 0.18 && LightOutlinerLum > 0.72,
                "ControlCentre Theme switch must re-theme SceneDirectoryPanel Outliner from dark OLED to Light");
        Require(OledInspectorLum < 0.22 && LightInspectorLum > 0.55,
                "ControlCentre Theme switch must re-theme the shared Inspector from dark OLED to Light");

        // 6. Apply the Sepia theme while the Log Stream remains hidden from the Project Everest workspace.
        {
            auto Draft  = Centre->QueryAppearance().QueryDraft();
            Draft.Theme = ThemeCategory::Sepia;
            Centre->QueryAppearance().ConfigureDraft(Draft);
            Centre->QueryAppearance().Apply();
            PumpWorkspaceFrames(8);
        }
        Require(!Workspace->QueryPanels().QueryOpen("LogStream"),
                "Applying themes must not expose Log Stream in the Project Everest workspace");
        const RasterizedCapture SepiaWorkspaceCapture =
            RasterizeCurrentFrame(Width, Height, ControlKit::Palette().Field);
        WritePngCapture(SepiaWorkspaceCapture, ExhibitImages / "06_ProjectEverest_Workspace_SepiaTheme.png");

        // Tear down workspace and verify all ten opening-scene RecordEntry objects unregister from both stores.
        Workspace.reset();
        Require(SceneDirectory::Instance().QueryCount() == 0u && RecordInspectorRegistry::Instance().QueryCount() == 0u,
                "Destroying EditorWorkspace must clear every Outliner row and typed Inspector descriptor");

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
               << "  \"log_stream_visible\": false,\n"
               << "  \"inspector_dock_count\": 1,\n"
               << "  \"oled_outliner_luminance\": " << OledOutlinerLum << ",\n"
               << "  \"light_outliner_luminance\": " << LightOutlinerLum << ",\n"
               << "  \"oled_inspector_luminance\": " << OledInspectorLum << ",\n"
               << "  \"light_inspector_luminance\": " << LightInspectorLum << ",\n"
               << "  \"global_environment_inspector_domains\": 6,\n"
               << "  \"captures\": [\n"
               << "    \"Exhibits/ProjectEverest/Images/01_ProjectBrowser_Projects.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/02_ProjectBrowser_SelectApplication.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/03_ProjectEverest_Workspace_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/04_ProjectEverest_ControlCentre_ThemeDrawer.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/05_ProjectEverest_Workspace_LightTheme.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/06_ProjectEverest_Workspace_SepiaTheme.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/07_ProjectEverest_FolderInspector_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/08_ProjectEverest_LensFlareInspector_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/09_ProjectEverest_CloudInspector_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/10_ProjectEverest_WindInspector_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/11_ProjectEverest_AtmosphereInspector_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/12_ProjectEverest_SunInspector_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/13_ProjectEverest_SunInspector_Daylight_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/14_ProjectEverest_SunInspector_LightColour_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/15_ProjectEverest_SunInspector_DiscOptics_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/16_ProjectEverest_AtmosphereInspector_Medium_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/17_ProjectEverest_AtmosphereInspector_LightResponse_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/18_ProjectEverest_AtmosphereInspector_Baking_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/19_ProjectEverest_AtmosphereInspector_MediumControls_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/20_ProjectEverest_CloudInspector_Formation_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/21_ProjectEverest_CloudInspector_Rendering_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/22_ProjectEverest_CloudInspector_Weather_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/23_ProjectEverest_WindInspector_Variability_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/24_ProjectEverest_WindInspector_Altitude_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/25_ProjectEverest_WindInspector_Receivers_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/26_ProjectEverest_LensFlareInspector_Compose_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/27_ProjectEverest_LensFlareInspector_Ghosts_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/28_ProjectEverest_LensFlareInspector_Halo_OLED.png\",\n"
               << "    \"Exhibits/ProjectEverest/Images/29_ProjectEverest_LensFlareInspector_Rays_OLED.png\"\n"
               << "  ]\n"
               << "}\n";

        std::cout << "PASS: Project Everest browser discovery, hidden Log Stream, docked Outliner + Viewport + one "
                     "shared Inspector, domain selection, and live theme switching\n";
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
