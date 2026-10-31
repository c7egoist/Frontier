/*==========================================================================================================================================
                                                        EDITORWORKSPACE.CPP
==========================================================================================================================================*/
// 🧩 Host the original Content Browser and optional Notification Stream through callbacks into their original owners.

#include "EditorWorkspace.h"
#include "Engine/Diagnostics/LogCategories.h"
#include "Engine/Diagnostics/LogStream.h"
#include "Engine/Interface/ControlKit.h"
#include "Engine/Interface/LogStreamPanelRegistration.h"
#include "Engine/Interface/ProjectDescriptor.h"
#include "Engine/Interface/SceneDirectoryPanelRegistration.h"
#include "Engine/Interface/SceneInspectorPanelRegistration.h"
#include "Engine/Interface/StackRailControls.h"
#include "Engine/Scene/GlobalEnvironmentRecords.h"
#include "Engine/Scene/SceneDirectory.h"
#include <cmath>
#include <cstdio>
#include <imgui.h>
#include <imgui_internal.h>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Frontier
{
EditorWorkspace::EditorWorkspace(ControlCentrePanel &ControlCentre)
    : Centre(ControlCentre), DockableBrowser(ControlCentre.QueryDockableContentBrowser())
{
    DockPanelSpecification LogSpecification     = MakeLogStreamPanelSpecification(LogPanel);
    LogSpecification.Open                       = false;
    DockPanelSpecification OutlinerSpecification = MakeSceneDirectoryPanelSpecification(OutlinerPanel);
    OutlinerSpecification.Open                  = false;
    DockPanelSpecification InspectorSpecification = MakeSceneInspectorPanelSpecification(InspectorPanel);
    InspectorSpecification.Open                  = false;
    InspectorPanel.BindDirectoryPanel(&OutlinerPanel);

    if (!Panels.Register({"content", "Content Browser",
                          [&]()
                          {
                              Centre.QueryContentBrowser().ConstructHostedInterface(
                                  Centre.QueryAppearance().QueryApplied().InterfaceScale / 100.0f,
                                  (!Centre.QueryQuickOpen() ||
                                   ImGui::GetWindowViewport() != ImGui::GetMainViewport()) &&
                                      !Centre.QueryConfirmation().QueryOpen());
                          },
                          DockableBrowser, [&]() { Centre.QueryContentBrowser().SuspendInteraction(); },
                          [&]() { return Centre.QueryDockableContentBrowser(); }}) ||
        !Panels.Register(
            {"notifications", "Notification Stream", [&]() { Centre.ConstructHostedNotificationStream(); }, false}) ||
        !Panels.Register({"viewport", "Viewport", [&]() { ConstructViewport(); }, true}) ||
        !Panels.Register(std::move(LogSpecification)) ||
        !Panels.Register(std::move(OutlinerSpecification)) ||
        !Panels.Register(std::move(InspectorSpecification)))
        throw std::runtime_error("Panel registration refused.");
    // 📝 The top bar owns the first 52 unscaled pixels; the dockspace starts below it.
    Panels.ConfigureWorkspaceInsets(52, 0);
    ImGui::GetIO().IniFilename = nullptr;
    ResetRevision              = Centre.QueryLayoutResetRevision();
    const auto &Path           = Centre.QueryPersonalProjectPath();
    if (Path.extension() != ".projectspace")
        ConfigureLayoutDiagnostic("Layout is session-only: no personal projectspace.");
    if (Path.extension() == ".projectspace" && std::filesystem::exists(Path))
    {
        ProjectSpaceDocument Document;
        std::string          Message;
        if (!ProjectSpaceCodec::Decode(Path, Document, Message))
        {
            LayoutBlocked = true;
            ConfigureLayoutDiagnostic("Layout read refused: " + Message);
        }
        else if (const auto Layout = Document.Sections["workspace"]["layout"]; Layout)
        {
            if (Layout.is_table() && Panels.ConfigureLayout(*Layout.as_table(), Message))
            {
                LayoutRestored = true;
                if (!DockableBrowser)
                    Centre.QueryContentBrowser().ConfigureOpen(
                        (*Layout.as_table())["browser_drawer_open"].value_or(false));
            }
            else
            {
                LayoutBlocked = true;
                ConfigureLayoutDiagnostic("Saved layout refused; defaults active. Reset saved layout to replace it.");
            }
        }
    }
}

EditorWorkspace::~EditorWorkspace()
{
    SceneRecords.clear();
    try
    {
        if (!FinalizeLayout() && !LayoutDiagnostic.empty())
            std::cerr << LayoutDiagnostic << '\n';
    }
    catch (const std::exception &Failure)
    {
        std::cerr << "Layout save failed: " << Failure.what() << '\n';
    }
    Centre.ConfigureDockedPanels(false, false);
    Centre.QueryContentBrowser().SuspendInteraction();
}

void EditorWorkspace::ActivateProjectWorkspace(
    const std::filesystem::path &ProjectPath, bool NotchBandCompositionRequested)
{
    NotchBandComposition = NotchBandCompositionRequested;
    if (NotchBandComposition)
    {
        Panels.ConfigureWorkspaceInsets(79.0f, 0.0f);
        Panels.ConfigureTabExtent(140.0f, 26.0f);
    }

    // Locate sibling .frontier descriptor if present to register declared user log categories.
    std::filesystem::path DescriptorCandidate = ProjectPath;
    if (DescriptorCandidate.extension() != ".frontier")
    {
        DescriptorCandidate.replace_extension(".frontier");
    }
    std::error_code Status;
    ProjectDescriptor Descriptor;
    std::string       DescriptorDiagnostic;
    bool              DecodedDescriptor = false;
    if (std::filesystem::is_regular_file(DescriptorCandidate, Status))
    {
        DecodedDescriptor = DecodeProjectDescriptor(DescriptorCandidate, Descriptor, DescriptorDiagnostic);
    }

    LogCategoryRegistry &Categories = LogCategories();
    if (DecodedDescriptor)
    {
        for (const ProjectLogCategory &Declared : Descriptor.LogCategories)
        {
            const LogColour Colour = ParseLogColour(Declared.Colour).value_or(LogColour::Neutral);
            (void)RegisterLogCategory(Declared.Name, Colour);
        }
    }

    const auto EmitEngine = [&](const char *ChannelName, LogSeverity Severity, LogVerbosity Verbosity,
                                std::string_view Message, std::string_view Source) {
        if (const LogCategory *Channel = Categories.QueryByName(ChannelName))
        {
            WriteLog(Channel->Token, Severity, Verbosity, Message, Source);
        }
    };

    EmitEngine("Interface", LogSeverity::Info, LogVerbosity::Display,
               "Application target activated · " + Project.ApplicationTarget + " · project \"" + Project.Name + "\"",
               "EditorWorkspace.cpp");
    EmitEngine("Content", LogSeverity::Info, LogVerbosity::Display,
               "Mounted project container · " +
                   (Project.StartupLevel.empty() ? std::string("blank startup scene")
                                                 : "opening scene " + Project.StartupLevel),
               "ProjectSpaceCodec.cpp");
    EmitEngine("Render", LogSeverity::Info, LogVerbosity::Display,
               "Dual-tier illumination contract armed · RTX VK_KHR_ray_query primary · GTX SDF + OrderedSoftwareBvh fallback",
               "EditorWorkspace.cpp");
    EmitEngine("Illumination", LogSeverity::Warning, LogVerbosity::Display,
               "Hardware ray query capability not yet probed on host · GTX SDF + OrderedSoftwareBvh fallback verified ready",
               "DualTierIllumination.toml");
    EmitEngine("Vehicle", LogSeverity::Info, LogVerbosity::Display,
               "Everest Concept GT chassis & wheel hierarchy bound · 1680 kg · wheelbase 2.78 m",
               "EverestVehicle.toml");

    if (const LogCategory *PowertrainChannel = Categories.QueryByName("Powertrain"))
    {
        WriteLog(PowertrainChannel->Token, LogSeverity::Info, LogVerbosity::Display,
                 "DualMotorAllWheel inverter online · 420 kW peak · torque vectoring active",
                 "ProjectEverestInterchange.cpp");
    }
    if (const LogCategory *CabinChannel = Categories.QueryByName("CabinHMI"))
    {
        WriteLog(CabinChannel->Token, LogSeverity::Info, LogVerbosity::Display,
                 "Cabin HMI telemetry bus connected · docked LogStream & ControlCentre theme synchronized",
                 "ProjectEverestInterchange.cpp");
    }
    if (const LogCategory *WeatherChannel = Categories.QueryByName("Weather"))
    {
        WriteLog(WeatherChannel->Token, LogSeverity::Info, LogVerbosity::Display,
                 "ProvingGrounds solar & sky medium configured · elevation 26.5 deg · turbidity 2.4",
                 "ProvingGrounds.scene.toml");
    }
    if (const LogCategory *FractureChannel = Categories.QueryByName("Fracture"))
    {
        WriteLog(FractureChannel->Token, LogSeverity::Info, LogVerbosity::Display,
                 "Voronoi fracture cell table Standby · Dedicated Fracture Studio scheduled in UI port plan",
                 "ProjectEverestInterchange.cpp");
    }

    // Seed the Proving Grounds tree with shared Engine environment records and automatic Inspector bindings.
    SceneRecords.clear();
    if (!Project.StartupLevel.empty())
    {
        SceneDirectory& Directory = SceneDirectory::Instance();
        auto EnvironmentFolder = std::make_unique<FolderRecord>("Environment", "ENV", 0xe8c27au);
        const RecordToken EnvironmentToken = EnvironmentFolder->Token();
        SceneRecords.push_back(std::move(EnvironmentFolder));

        auto VehicleRecord = std::make_unique<SceneRecord>(RecordClassification::Vehicle);
        (void)Directory.ConfigureName(VehicleRecord->Token(), "Everest Concept GT");
        const RecordToken VehicleToken = VehicleRecord->Token();
        SceneRecords.push_back(std::move(VehicleRecord));

        auto TyreRecord = std::make_unique<SceneRecord>(RecordClassification::Tyre);
        (void)Directory.ConfigureName(TyreRecord->Token(), "Wheel & Tyre Assembly");
        (void)Directory.ConfigureParent(TyreRecord->Token(), VehicleToken);
        SceneRecords.push_back(std::move(TyreRecord));

        auto SunRecordInstance = std::make_unique<SunRecord>(EnvironmentToken);
        const RecordToken SunToken = SunRecordInstance->Token();
        SceneRecords.push_back(std::move(SunRecordInstance));

        auto LensFlareInstance = std::make_unique<LensFlareRecord>(SunToken);
        SceneRecords.push_back(std::move(LensFlareInstance));

        SceneRecords.push_back(std::make_unique<CloudLayerRecord>(EnvironmentToken));
        SceneRecords.push_back(std::make_unique<WindFieldRecord>(EnvironmentToken));
        SceneRecords.push_back(std::make_unique<AtmosphereRecord>(EnvironmentToken));

        auto IlluminationRecord = std::make_unique<SceneRecord>(RecordClassification::Illumination);
        (void)Directory.ConfigureName(IlluminationRecord->Token(), "Dual-Tier GI & Reflections");
        SceneRecords.push_back(std::move(IlluminationRecord));

        auto CameraRecord = std::make_unique<SceneRecord>(RecordClassification::Camera);
        (void)Directory.ConfigureName(CameraRecord->Token(), "Proving Grounds Chase Camera");
        SceneRecords.push_back(std::move(CameraRecord));

        OutlinerPanel.Select(SunToken);
    }

    (void)Panels.ConfigureOpen("viewport", true);
    (void)Panels.ConfigureOpen("LogStream", true);
    (void)Panels.ConfigureOpen("Inspector", true);
    (void)Panels.ConfigureOpen("Outliner", true);
    PendingProjectSplit = !LayoutRestored;
    LogPanel.Synchronize(LogStore(), Categories, 1.0 / 60.0);
    OutlinerPanel.Synchronize(SceneDirectory::Instance());
}

bool EditorWorkspace::ConfigurePlatform() noexcept
{
    Panels.ConfigureDetachedWindows(Centre.QueryDetachedWindows());
    return Panels.ConfigurePlatform();
}

void EditorWorkspace::ConstructInterface()
{
    if (ResetRevision != Centre.QueryLayoutResetRevision())
    {
        ResetRevision = Centre.QueryLayoutResetRevision();
        Panels.ResetLayout();
        (void)Panels.ConfigureOpen("content", Centre.QueryDockableContentBrowser());
        (void)Panels.ConfigureOpen("notifications", false);
        (void)Panels.ConfigureOpen("viewport", true);
        if (NotchBandComposition)
        {
            (void)Panels.ConfigureOpen("LogStream", true);
            (void)Panels.ConfigureOpen("Outliner", true);
            (void)Panels.ConfigureOpen("Inspector", true);
            PendingProjectSplit = true;
        }
        else
        {
            (void)Panels.ConfigureOpen("LogStream", false);
            (void)Panels.ConfigureOpen("Outliner", false);
        }
        LayoutBlocked = false;
        SavedLayout.clear();
        ObservedLayout.clear();
        ObservedSnapshot.clear();
        PersistenceFrames = 0;
        RetrySeconds = StableSeconds = 0;
        ConfigureLayoutDiagnostic("Layout reset; saves automatically.");
    }
    if (DockableBrowser != Centre.QueryDockableContentBrowser())
    {
        const bool Visible = Panels.QueryOpen("content");
        DockableBrowser    = Centre.QueryDockableContentBrowser();
        Centre.QueryContentBrowser().SuspendInteraction();
        (void)Panels.ConfigureOpen("content", DockableBrowser);
        Centre.QueryContentBrowser().ConfigureOpen(!DockableBrowser && Visible);
    }

    const double ElapsedSeconds = ImGui::GetIO().DeltaTime > 0.0f ? ImGui::GetIO().DeltaTime : (1.0 / 60.0);
    LogPanel.Synchronize(LogStore(), LogCategories(), ElapsedSeconds);

    while (const std::optional<SceneInspectorPanel::SubfolderRequest> Request = InspectorPanel.TakeSubfolderRequest())
    {
        auto Folder = std::make_unique<FolderRecord>(Request->Title, "DIR", 0xe8c27au,
                                                     Request->EnclosingFolderToken);
        const RecordToken FolderToken = Folder->Token();
        SceneRecords.push_back(std::move(Folder));
        OutlinerPanel.Select(FolderToken);
    }

    while (const std::optional<GlobalScenePreset> Preset = OutlinerPanel.TakePresetSpawnRequest())
    {
        const RecordToken SelectedToken = OutlinerPanel.QuerySelected();
        const SceneDirectory& Directory = SceneDirectory::Instance();
        RecordToken EnvironmentFolderToken{};
        RecordToken SunToken{};
        for (const std::unique_ptr<RecordEntry>& Existing : SceneRecords)
        {
            if (dynamic_cast<FolderRecord*>(Existing.get()) != nullptr &&
                Directory.QueryName(Existing->Token()) == "Environment")
                EnvironmentFolderToken = Existing->Token();
            if (dynamic_cast<SunRecord*>(Existing.get()) != nullptr) SunToken = Existing->Token();
        }
        const RecordToken SelectedEnclosure =
            Directory.QueryClassification(SelectedToken) == RecordClassification::Folder ? SelectedToken
                                                                                          : EnvironmentFolderToken;
        std::unique_ptr<RecordEntry> Added;
        switch (*Preset)
        {
            case GlobalScenePreset::Folder:
                Added = std::make_unique<FolderRecord>("New Folder", "DIR", 0xe8c27au, SelectedEnclosure);
                break;
            case GlobalScenePreset::Sun:
                Added = std::make_unique<SunRecord>(SelectedEnclosure);
                break;
            case GlobalScenePreset::LensFlare:
                Added = std::make_unique<LensFlareRecord>(SunToken);
                break;
            case GlobalScenePreset::Clouds:
                Added = std::make_unique<CloudLayerRecord>(SelectedEnclosure);
                break;
            case GlobalScenePreset::Wind:
                Added = std::make_unique<WindFieldRecord>(SelectedEnclosure);
                break;
            case GlobalScenePreset::Atmosphere:
                Added = std::make_unique<AtmosphereRecord>(SelectedEnclosure);
                break;
        }
        if (Added)
        {
            OutlinerPanel.Select(Added->Token());
            SceneRecords.push_back(std::move(Added));
            (void)Panels.ConfigureOpen("Inspector", true);
        }
    }

    while (const std::optional<RecordClassification> Spawn = OutlinerPanel.TakeSpawnRequest())
    {
        auto Record = std::make_unique<SceneRecord>(*Spawn);
        const std::string SpawnName = std::string(RecordClassificationName(*Spawn)) + " (spawned)";
        (void)SceneDirectory::Instance().ConfigureName(Record->Token(), SpawnName);
        if (const LogCategory *InterfaceChannel = LogCategories().QueryByName("Interface"))
        {
            WriteLog(InterfaceChannel->Token, LogSeverity::Info, LogVerbosity::Display,
                     "Spawned scene record \"" + SpawnName + "\" via Outliner constructor registration",
                     "EditorWorkspace.cpp");
        }
        SceneRecords.push_back(std::move(Record));
    }
    OutlinerPanel.Synchronize(SceneDirectory::Instance());

    const float Scale = Centre.QueryAppearance().QueryApplied().InterfaceScale / 100.0f;
    Centre.ConfigureDockedPanels(DockableBrowser, Panels.QueryOpen("notifications"));
    if (NotchBandComposition)
        ConstructNotchBandReturnButton(Scale);
    else
        ConstructTopBar(Scale);
    Panels.ConstructInterface(Scale);

    if (PendingProjectSplit && Panels.QuerySeated() && Panels.QueryDockspace() != 0)
    {
        if (ImGuiViewport *PrimaryViewport = ImGui::GetMainViewport())
        {
            const ImGuiID Root = Panels.QueryDockspace();
            ImGui::DockBuilderRemoveNodeChildNodes(Root);
            ImGui::DockBuilderSetNodePos(Root, ImVec2(PrimaryViewport->Pos.x, PrimaryViewport->Pos.y + 38.0f * Scale));
            ImGui::DockBuilderSetNodeSize(
                Root, ImVec2(PrimaryViewport->Size.x, std::max(120.0f, PrimaryViewport->Size.y - 72.0f * Scale)));

            ImGuiID LeftColumn = 0;
            ImGuiID CentreRight = 0;
            ImGui::DockBuilderSplitNode(Root, ImGuiDir_Left, 0.20f, &LeftColumn, &CentreRight);

            ImGuiID CentreColumn = 0;
            ImGuiID RightColumn = 0;
            ImGui::DockBuilderSplitNode(CentreRight, ImGuiDir_Right, 0.66f, &RightColumn, &CentreColumn);

            ImGui::DockBuilderDockWindow("Outliner###FrontierPanel-Outliner", LeftColumn);
            ImGui::DockBuilderDockWindow("Viewport###FrontierPanel-viewport", CentreColumn);
            if (Centre.QueryDockableContentBrowser())
            {
                ImGuiID UpperViewport = 0;
                ImGuiID LowerBrowser = 0;
                ImGui::DockBuilderSplitNode(CentreColumn, ImGuiDir_Down, 0.34f, &LowerBrowser, &UpperViewport);
                ImGui::DockBuilderDockWindow("Viewport###FrontierPanel-viewport", UpperViewport);
                ImGui::DockBuilderDockWindow("Content Browser###FrontierPanel-content", LowerBrowser);
            }
            else
            {
                ImGui::DockBuilderDockWindow("Content Browser###FrontierPanel-content", CentreColumn);
            }
            ImGuiID LogColumn = RightColumn;
            ImGuiID InspectorColumn = 0;
            ImGui::DockBuilderSplitNode(RightColumn, ImGuiDir_Down, 0.46f, &InspectorColumn, &LogColumn);
            ImGui::DockBuilderDockWindow("Notifications###FrontierPanel-notifications", LogColumn);
            ImGui::DockBuilderDockWindow("Log Stream###FrontierPanel-LogStream", LogColumn);
            ImGui::DockBuilderDockWindow("Inspector###FrontierPanel-Inspector", InspectorColumn);
            ImGui::DockBuilderFinish(Root);
            PendingProjectSplit = false;
        }
    }
    Rendered = true;
    Centre.ConfigureDockedPanels(DockableBrowser, Panels.QueryOpen("notifications"));
}

void EditorWorkspace::ConstructNotchBandReturnButton(float Scale)
{
    if (!EvaluateReturnToBrowser) return;
    const auto *PrimaryViewport = ImGui::GetMainViewport();
    if (PrimaryViewport->WorkSize.x <= 0 || PrimaryViewport->WorkSize.y <= 0) return;

    const KitFaces Faces = ResolveKitFaces();
    const KitTheme Theme = ResolveKitTheme();
    ImGui::SetNextWindowPos(ImVec2(PrimaryViewport->WorkPos.x + 14.0f * Scale, PrimaryViewport->WorkPos.y + 10.0f * Scale));
    ImGui::SetNextWindowSize(ImVec2(320.0f * Scale, 34.0f * Scale));
    ImGui::SetNextWindowViewport(PrimaryViewport->ID);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0, 0));
    ImGui::PushStyleColor(ImGuiCol_WindowBg, ImVec4(0, 0, 0, 0));
    if (ImGui::Begin("##FrontierNotchReturnBar", nullptr,
                     ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoSavedSettings |
                         ImGuiWindowFlags_NoDocking | ImGuiWindowFlags_NoBackground |
                         ImGuiWindowFlags_NoBringToFrontOnFocus))
    {
        ImDrawList  *Ink      = ImGui::GetWindowDrawList();
        const ImVec2 Minimum  = ImGui::GetWindowPos();
        const float  PillH    = 28.0f * Scale;
        const char  *Caption  = "Projects";
        const float  ArrowGap = 15.0f * Scale;
        const float  TextW    = KitTextWidth(Faces.Medium, 12.0f * Scale, Caption);
        const float  PillW    = ArrowGap + TextW + 24.0f * Scale;
        bool         Hovered  = false;
        if (KitTarget("##ReturnToProjectBrowser", Minimum, ImVec2(PillW, PillH), Hovered,
                      "Return to Frontier Project Browser"))
        {
            EvaluateReturnToBrowser();
        }
        KitPillSurface(Ink, Minimum, ImVec2(Minimum.x + PillW, Minimum.y + PillH),
                       Hovered ? Theme.Surface3 : Theme.Surface2, Theme.Line, 999.0f);
        const float ArrowCY    = Minimum.y + PillH * 0.5f;
        const float ArrowLeft  = Minimum.x + 11.0f * Scale;
        const float ArrowRight = ArrowLeft + 9.0f * Scale;
        const float Wing       = 3.5f * Scale;
        Ink->AddLine(ImVec2(ArrowLeft, ArrowCY), ImVec2(ArrowRight, ArrowCY), Theme.Text, 1.4f * Scale);
        Ink->AddLine(ImVec2(ArrowLeft + Wing, ArrowCY - Wing), ImVec2(ArrowLeft, ArrowCY), Theme.Text, 1.4f * Scale);
        Ink->AddLine(ImVec2(ArrowLeft + Wing, ArrowCY + Wing), ImVec2(ArrowLeft, ArrowCY), Theme.Text, 1.4f * Scale);
        KitDrawText(Ink, Faces.Medium, 12.0f * Scale,
                    ImVec2(Minimum.x + 12.0f * Scale + ArrowGap, Minimum.y + (PillH - 12.0f * Scale) * 0.5f),
                    Theme.Text, Caption);

        const float BadgeX = Minimum.x + PillW + 10.0f * Scale;
        KitDrawText(Ink, Faces.Medium, 12.5f * Scale,
                    ImVec2(BadgeX, Minimum.y + (PillH - 12.5f * Scale) * 0.5f), Theme.Muted, Project.Name.c_str());
    }
    ImGui::End();
    ImGui::PopStyleColor();
    ImGui::PopStyleVar();
}

void EditorWorkspace::ConstructTopBar(float Scale)
{
    const auto *PrimaryViewport = ImGui::GetMainViewport();
    if (PrimaryViewport->WorkSize.x <= 0 || PrimaryViewport->WorkSize.y <= 0) return;
    ImGui::SetNextWindowPos(PrimaryViewport->WorkPos);
    ImGui::SetNextWindowSize(ImVec2(PrimaryViewport->WorkSize.x, 52 * Scale));
    ImGui::SetNextWindowViewport(PrimaryViewport->ID);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(12 * Scale, 0));
    ImGui::Begin("Frontier editor top bar", nullptr,
                 ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoSavedSettings |
                     ImGuiWindowFlags_NoDocking | ImGuiWindowFlags_NoBringToFrontOnFocus);
    const float CentreY = (52 * Scale - ImGui::GetFrameHeight()) * .5f;
    ImGui::SetCursorPosY(CentreY);
    if (ImGui::Button("< Back"))
    {
        if (EvaluateReturnToBrowser) EvaluateReturnToBrowser();
    }
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Return to the Project Browser");
    ImGui::SameLine();
    ImGui::SetCursorPosY(CentreY);
    ImGui::TextUnformatted(Project.Name.c_str());
    ImGui::SameLine();
    ImGui::SetCursorPosY(CentreY);
    ImGui::TextDisabled("%zu levels · %zu catalogue entries", Project.Levels, Project.Catalogue);
    const char *Actions[] = {"Log Stream", "Control centre", "Theme", "Settings"};
    float ActionsWidth = 0;
    for (const auto *Action : Actions)
        ActionsWidth += ImGui::CalcTextSize(Action).x + ImGui::GetStyle().FramePadding.x * 2 + ImGui::GetStyle().ItemSpacing.x;
    ImGui::SameLine(PrimaryViewport->WorkSize.x - ActionsWidth - 12 * Scale);
    ImGui::SetCursorPosY(CentreY);
    if (ImGui::Button(Actions[0])) (void)Panels.ConfigureOpen("LogStream", !Panels.QueryOpen("LogStream"));
    ImGui::SameLine();
    ImGui::SetCursorPosY(CentreY);
    if (ImGui::Button(Actions[1])) Centre.ActivateSettingsPage(ControlCentrePageCategory::QuickControls);
    ImGui::SameLine();
    ImGui::SetCursorPosY(CentreY);
    if (ImGui::Button(Actions[2])) Centre.ActivatePage(AppearancePageCategory::Theme);
    ImGui::SameLine();
    ImGui::SetCursorPosY(CentreY);
    if (ImGui::Button(Actions[3])) Centre.ActivateSettingsPage(ControlCentrePageCategory::Settings);
    ImGui::End();
    ImGui::PopStyleVar();
}

void EditorWorkspace::ConstructViewport()
{
    if (!NotchBandComposition)
    {
        ImGui::TextDisabled("SCENE CANVAS");
        ImGui::TextWrapped("Native scene and document rendering are not connected yet. "
                           "The Content Browser tab holds this project's real files; appearance, input and "
                           "notification settings live behind Control centre, Theme and Settings above.");
        ImGui::Spacing();
        ImGui::Separator();
        const auto Row = [](const char *Label, const std::string &Value)
        {
            ImGui::TextDisabled("%s", Label);
            ImGui::SameLine(150);
            ImGui::TextWrapped("%s", Value.empty() ? "—" : Value.c_str());
        };
        Row("Project", Project.Name);
        Row("Location", Project.Location);
        Row("Identity", Project.Identity);
        Row("Levels", std::to_string(Project.Levels));
        Row("Content roots", std::to_string(Project.Roots));
        Row("Catalogue", std::to_string(Project.Catalogue));
        Row("Startup level", Project.StartupLevel);
        return;
    }

    const KitFaces Faces   = ResolveKitFaces();
    const KitTheme Theme   = ResolveKitTheme();
    const ImVec2   Origin  = ImGui::GetWindowPos();
    const ImVec2   Size    = ImGui::GetWindowSize();
    const float    PL      = Origin.x;
    const float    PT      = Origin.y;
    const float    PR      = PL + Size.x;
    const float    PB      = PT + Size.y;
    const float    CL      = PL + 18.0f;
    const float    CR      = PR - 18.0f;
    const float    Width   = std::max(40.0f, CR - CL);
    ImDrawList    *Ink     = ImGui::GetWindowDrawList();

    Ink->AddRectFilled(Origin, ImVec2(PR, PB), Theme.PanelBg);
    Ink->AddRect(Origin, ImVec2(PR, PB), Theme.PanelEdge);

    // Header strip matching StackRail / LogStream visual grammar.
    const float HeadCY = PT + 30.0f;
    Ink->AddRectFilled(ImVec2(CL, HeadCY - 15.0f), ImVec2(CL + 30.0f, HeadCY + 15.0f), Theme.Surface2, 9.0f);
    Ink->AddRect(ImVec2(CL, HeadCY - 15.0f), ImVec2(CL + 30.0f, HeadCY + 15.0f), Theme.Line, 9.0f);
    Ink->AddCircle(ImVec2(CL + 15.0f, HeadCY), 7.0f, Theme.Mint, 20, 1.8f);
    Ink->AddCircleFilled(ImVec2(CL + 15.0f, HeadCY), 2.5f, Theme.Mint);
    KitDrawText(Ink, Faces.Medium, 20.0f, ImVec2(CL + 44.0f, HeadCY - 10.0f), Theme.Text, Project.Name.c_str());

    const char *StageBadge = "UI STAGE READY · RENDERER PENDING";
    const float BadgeW     = KitTextWidth(Faces.Medium, 10.5f, StageBadge) + 22.0f;
    if (CR - BadgeW > CL + 200.0f)
    {
        KitPillSurface(Ink, ImVec2(CR - BadgeW, HeadCY - 12.0f), ImVec2(CR, HeadCY + 12.0f), Theme.MintDim,
                       KitInkWithAlpha(Theme.Mint, 0.42f), 999.0f);
        KitDrawText(Ink, Faces.Medium, 10.5f, ImVec2(CR - BadgeW + 11.0f, HeadCY - 5.25f), Theme.Mint, StageBadge);
    }

    float Y = PT + 60.0f;
    const float CanvasH = std::max(140.0f, (PB - Y) - 210.0f);
    const ControlKitPalette &Palette = ControlKit::Palette();
    const ImU32 CanvasFill = Palette.LightSurface ? KitInkHex(0xe9edf2) : KitInkHex(0x070a0d);
    Ink->AddRectFilled(ImVec2(CL, Y), ImVec2(CR, Y + CanvasH), CanvasFill, 14.0f);
    Ink->AddRect(ImVec2(CL, Y), ImVec2(CR, Y + CanvasH), Theme.Line, 14.0f);

    // Subtle viewport perspective horizon & grid lines inside the canvas card.
    const float HorizonY = Y + CanvasH * 0.56f;
    Ink->AddLine(ImVec2(CL + 14.0f, HorizonY), ImVec2(CR - 14.0f, HorizonY), Theme.LineSoft, 1.0f);
    for (int Index = -3; Index <= 3; ++Index)
    {
        const float TopX = (CL + CR) * 0.5f + static_cast<float>(Index) * (Width * 0.045f);
        const float BotX = (CL + CR) * 0.5f + static_cast<float>(Index) * (Width * 0.135f);
        const float ClampedBotX = std::clamp(BotX, CL + 14.0f, CR - 14.0f);
        Ink->AddLine(ImVec2(TopX, HorizonY), ImVec2(ClampedBotX, Y + CanvasH - 12.0f), Theme.LineSoft, 1.0f);
    }
    KitDrawTracked(Ink, Faces.Medium, 10.5f, ImVec2(CL + 18.0f, Y + 16.0f), Theme.Muted,
                   "VULKAN SCENE VIEWPORT / PROVING GROUNDS", 1.2f);
    KitDrawText(Ink, Faces.Regular, 12.5f, ImVec2(CL + 18.0f, Y + 36.0f), Theme.Faint,
                "UI host, docking, ControlCentre theme, Outliner, and LogStream active.");

    Y += CanvasH + 12.0f;
    const float InfoH = std::max(140.0f, PB - Y - 16.0f);
    Ink->AddRectFilled(ImVec2(CL, Y), ImVec2(CR, Y + InfoH), Theme.Surface, 14.0f);
    Ink->AddRect(ImVec2(CL, Y), ImVec2(CR, Y + InfoH), Theme.LineSoft, 14.0f);

    const auto ThemeLabel = [](ThemeCategory Selected) -> const char * {
        switch (Selected)
        {
            case ThemeCategory::Oled:    return "OLED";
            case ThemeCategory::Dark:    return "Dark";
            case ThemeCategory::Dim:     return "Dim";
            case ThemeCategory::Light:   return "Light";
            case ThemeCategory::Sepia:   return "Sepia";
            case ThemeCategory::Dracula: return "Dracula";
            case ThemeCategory::Nord:    return "Nord";
            case ThemeCategory::GitHub:  return "GitHub";
            case ThemeCategory::Count:   break;
        }
        return "Custom";
    };

    const auto &Applied = Centre.QueryAppearance().QueryApplied();
    char ScaleText[32] = {};
    std::snprintf(ScaleText, sizeof(ScaleText), "%.0f%% scale", Applied.InterfaceScale);
    const std::pair<const char *, std::string> Rows[] = {
        {"APPLICATION", Project.ApplicationTarget},
        {"STARTUP SCENE", Project.StartupLevel.empty() ? "—" : Project.StartupLevel},
        {"RTX TIER", "VK_KHR_acceleration_structure + VK_KHR_ray_query (Full RT)"},
        {"GTX FALLBACK", "SignedDistanceField GI + OrderedSoftwareBvh Reflections"},
        {"UI THEME", std::string(ThemeLabel(Applied.Theme)) + " · " + ScaleText},
    };
    float RowY = Y + 14.0f;
    for (const auto &Item : Rows)
    {
        if (RowY + 20.0f > Y + InfoH - 8.0f) break;
        KitDrawTracked(Ink, Faces.Medium, 10.0f, ImVec2(CL + 16.0f, RowY + 2.0f), Theme.Faint, Item.first, 1.0f);
        KitDrawText(Ink, Faces.Regular, 12.5f, ImVec2(CL + 132.0f, RowY), Theme.Text, Item.second.c_str());
        RowY += 25.0f;
    }
}

namespace
{
std::string EncodeText(const toml::table &Layout)
{
    std::ostringstream Text;
    Text << Layout;
    return Text.str();
}
} // namespace

void EditorWorkspace::ConfigureLayoutDiagnostic(std::string Message)
{
    LayoutDiagnostic = std::move(Message);
    Centre.ConfigureLayoutDiagnostic(LayoutDiagnostic);
}

toml::table EditorWorkspace::CaptureLayout() const
{
    auto Layout = Panels.EncodeLayout();
    if (!Layout.empty())
        Layout.insert_or_assign("browser_drawer_open", Centre.QueryContentBrowser().QueryExpansionTab().QueryOpen());
    return Layout;
}

bool EditorWorkspace::FinalizeLayout()
{
    if (!Rendered || !Panels.QuerySeated() || LayoutBlocked)
        return !LayoutBlocked;
    const auto &Path = Centre.QueryPersonalProjectPath();
    if (Path.extension() != ".projectspace")
        return true;
    const auto &IO     = ImGui::GetIO();
    const auto  Layout = IO.DisplaySize.x > 0 && IO.DisplaySize.y > 0 ? CaptureLayout() : ObservedSnapshot;
    if (Layout.empty())
        return true;
    std::string Message;
    if (!PanelDockspace::ValidateLayout(Layout, Message))
    {
        ConfigureLayoutDiagnostic("Layout save refused: " + Message);
        return false;
    }
    const auto Text = EncodeText(Layout);
    if (Text == SavedLayout)
        return true;
    if (!Centre.PersistWorkspaceLayout(Layout, Message))
    {
        ConfigureLayoutDiagnostic("Layout save failed: " + Message);
        return false;
    }
    SavedLayout = Text;
    ConfigureLayoutDiagnostic("Layout saved in personal projectspace.");
    return true;
}

void EditorWorkspace::IntegrateLayoutPersistence(double ElapsedSeconds)
{
    if (!Rendered || LayoutBlocked || !std::isfinite(ElapsedSeconds) || ElapsedSeconds < 0 ||
        Centre.QueryPersonalProjectPath().extension() != ".projectspace")
        return;
    // 📝 Call after Render: tabs, splitters and platform geometry must have completed the current frame.
    if (++PersistenceFrames < 8 || ImGui::GetIO().DisplaySize.x <= 0 || ImGui::GetIO().DisplaySize.y <= 0)
        return;
    const auto Snapshot = CaptureLayout();
    const auto Current  = EncodeText(Snapshot);
    RetrySeconds        = std::max(0.0, RetrySeconds - ElapsedSeconds);
    if (Current != ObservedLayout)
    {
        ObservedLayout   = Current;
        ObservedSnapshot = Snapshot;
        StableSeconds    = 0;
        return;
    }
    StableSeconds += std::min(ElapsedSeconds, .25);
    if (Current != SavedLayout && StableSeconds >= 2 && RetrySeconds <= 0 && !ImGui::IsMouseDown(0) &&
        !ImGui::IsMouseDown(1) &&
        !ImGui::IsPopupOpen(nullptr, ImGuiPopupFlags_AnyPopupId | ImGuiPopupFlags_AnyPopupLevel))
        if (!FinalizeLayout())
            RetrySeconds = 10;
}
} // namespace Frontier
