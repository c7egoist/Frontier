/*==========================================================================================================================================
                                                        EVERESTWORKSPACE.CPP
==========================================================================================================================================*/
// 🧩 Project Everest workspace implementation: EverestApplication runtime + #if FRONTIER_EDITOR docked authoring interface.

#include "EverestWorkspace.h"

#include "Engine/Diagnostics/LogCategories.h"
#include "Engine/Diagnostics/LogStream.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)
#include "Engine/Interface/InspectorControls.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Interface/LogStreamPanelRegistration.h"
#include "Engine/Interface/NativeInspectors.h"
#include "Engine/Interface/SceneDirectoryPanelRegistration.h"
#include "Engine/Interface/SceneInspectorPanel.h"
#include "Engine/Interface/ViewportChromeControls.h"
#include "Engine/Scene/SceneDirectory.h"
#include <imgui.h>
#include <imgui_internal.h>
#endif

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <vector>

namespace Everest
{

namespace
{

uint32_t EnsureProjectLogCategory(std::string_view CategoryName)
{
    return Frontier::LogCategories().Register(CategoryName, Frontier::LogColour::Mint, true);
}

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

float MeasureLabelWidth(ImFont* Font, float Size, const char* Text) noexcept
{
    if (Font == nullptr || Text == nullptr || Text[0] == '\0')
    {
        return 0.0f;
    }
    return Font->CalcTextSizeA(Size, 1.0e9f, 0.0f, Text).x;
}

#endif

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                    VIEWPORT CAMERA
//------------------------------------------------------------------------------------------------------------------------

namespace
{

constexpr double DegreesToRadian = 3.14159265358979323846 / 180.0;

// 📝 Unreal Engine 5 editor viewport constants (FEditorViewportClient, FCameraControllerConfig, ULevelEditorViewportSettings
//    defaults), in metres where Unreal counts centimetres.
constexpr double MouseSensitivity        = 0.2;      // [°/px] MouseSensitivty: look, orbit and the left-drag turn
constexpr double DragMetresPerPixel      = 0.01;     // [m/px] at speed 1: drags move 1 cm per pixel (Drag *= CameraSpeed)
constexpr double FlightAcceleration      = 200.0;    // [m/s²] MovementAccelerationRate 20000 cm/s²
constexpr double FlightDamping           = 10.0;     // [1/s] MovementVelocityDampingAmount: 20 m/s at speed 1
constexpr double FieldOfViewAcceleration = 1200.0;   // [°/s²] FOVAccelerationRate
constexpr double FieldOfViewDamping      = 10.0;     // [1/s] FOVVelocityDampingAmount, also the recoil rate
constexpr double WheelDollyMetres        = 0.96;     // [m] per notch: GetCameraSpeed(MouseScrollCameraSpeed 5) = 3 × 32 cm
constexpr double ShiftBoost              = 2.0;      // [-] CameraBoost while Shift is held
constexpr double ElevationLimit          = 89.5;     // [°] short of the pole, where a z-up look-at degenerates
constexpr double OrbitDollyRate          = 0.004;    // [1/px] Alt + right drag: pivot distance × e^(−rate · (Δx + Δy))
constexpr double OrbitTrackRate          = 0.0016;   // [1/px] Alt + middle drag: pivot distance × rate per pixel

} // namespace

std::array<double, 3> SceneViewportFlight::ResolveForward() const noexcept
{
    const double θ = Heading * DegreesToRadian;
    const double φ = Elevation * DegreesToRadian;
    return {std::cos(φ) * std::cos(θ), std::cos(φ) * std::sin(θ), std::sin(φ)};
}

// 📝 Screen right of the renderer's view (ConstructViewTransform: Right = Forward × Up, z up). The former orbit camera used
//    Up × Forward here, which is why A and D moved the wrong way.
std::array<double, 3> SceneViewportFlight::ResolveLateral() const noexcept
{
    const double θ = Heading * DegreesToRadian;
    return {std::sin(θ), -std::cos(θ), 0.0};
}

std::array<double, 3> SceneViewportFlight::ResolveTarget() const noexcept
{
    const std::array<double, 3> Forward = ResolveForward();
    return {Position[0] + Forward[0] * PivotDistance, Position[1] + Forward[1] * PivotDistance, Position[2] + Forward[2] * PivotDistance};
}

double SceneViewportFlight::ResolveFieldOfView() const noexcept
{
    return std::clamp(VerticalFieldOfView / DegreesToRadian + FieldOfViewOffset, 5.0, 140.0) * DegreesToRadian;
}

double SceneViewportFlight::ResolveSpeed(int Setting) noexcept
{
    constexpr std::array<double, 8> Speeds = {0.03125, 0.09375, 0.33, 1.0, 3.0, 8.0, 16.0, 32.0};
    return Speeds[static_cast<size_t>(std::clamp(Setting, 1, 8) - 1)];
}

void IntegrateSceneViewportFlight(SceneViewportFlight& Flight, const SceneViewportPointer& Pointer, double DeltaSeconds)
{
    const double Δt     = std::clamp(DeltaSeconds, 0.0, 0.1);
    const double Speed  = SceneViewportFlight::ResolveSpeed(Flight.SpeedSetting);
    const double Δx     = Pointer.MotionPixels[0];
    const double Δy     = Pointer.MotionPixels[1];
    const bool   Flying = Pointer.Active && Pointer.RightDown && !Pointer.LeftDown && !Pointer.AltDown;
    auto Translate = [&Flight](const std::array<double, 3>& Axis, double Metres) {
        for (int Component = 0; Component < 3; ++Component) Flight.Position[Component] += Axis[Component] * Metres;
    };
    auto Turn = [&Flight](double HeadingDegrees, double ElevationDegrees) {
        Flight.Heading   = std::remainder(Flight.Heading + HeadingDegrees, 360.0);
        Flight.Elevation = std::clamp(Flight.Elevation + ElevationDegrees, -ElevationLimit, ElevationLimit);
    };
    auto ResolveUpward = [&Flight]() {
        const std::array<double, 3> Forward = Flight.ResolveForward();
        const std::array<double, 3> Lateral = Flight.ResolveLateral();
        return std::array<double, 3>{Lateral[1] * Forward[2] - Lateral[2] * Forward[1], Lateral[2] * Forward[0] - Lateral[0] * Forward[2],
                                     Lateral[0] * Forward[1] - Lateral[1] * Forward[0]};
    };

    // ① drags (Unreal's ConvertMovementToDragRot and orbit modes): pointer right turns right, pointer up looks up
    if (Pointer.Active && Pointer.AltDown && (Pointer.LeftDown || Pointer.RightDown || Pointer.MiddleDown))
    {
        const std::array<double, 3> Pivot = Flight.ResolveTarget();
        if (Pointer.LeftDown)
        {
            // 📝 Alt + left: orbit the pivot.
            Turn(-Δx * MouseSensitivity, -Δy * MouseSensitivity);
        }
        else if (Pointer.RightDown)
        {
            // 📝 Alt + right: dolly toward the pivot (pointer right or down) or away from it.
            Flight.PivotDistance = std::clamp(Flight.PivotDistance * std::exp(-OrbitDollyRate * (Δx + Δy)), 0.25, 5000.0);
        }
        if (Pointer.MiddleDown && !Pointer.LeftDown && !Pointer.RightDown)
        {
            // 📝 Alt + middle: track the camera and its pivot with the pointer, in the view plane.
            const double Metres = OrbitTrackRate * Flight.PivotDistance;
            Translate(Flight.ResolveLateral(), Δx * Metres);
            Translate(ResolveUpward(), -Δy * Metres);
        }
        else
        {
            const std::array<double, 3> Forward = Flight.ResolveForward();
            for (int Component = 0; Component < 3; ++Component) Flight.Position[Component] = Pivot[Component] - Forward[Component] * Flight.PivotDistance;
        }
    }
    else if (Pointer.Active && (Pointer.MiddleDown || (Pointer.LeftDown && Pointer.RightDown)))
    {
        // 📝 Middle, or left + right: move right/left and up/down (world z) with the pointer, without turning.
        Translate(Flight.ResolveLateral(), Δx * DragMetresPerPixel * Speed);
        Translate({0.0, 0.0, 1.0}, -Δy * DragMetresPerPixel * Speed);
    }
    else if (Pointer.Active && Pointer.LeftDown)
    {
        // 📝 Left: forward/back over the ground plane (pointer up = forward) and turn left/right.
        const double θ = Flight.Heading * DegreesToRadian;
        Translate({std::cos(θ), std::sin(θ), 0.0}, -Δy * DragMetresPerPixel * Speed);
        Turn(-Δx * MouseSensitivity, 0.0);
    }
    else if (Flying)
    {
        // 📝 Right: look around in place.
        Turn(-Δx * MouseSensitivity, -Δy * MouseSensitivity);
    }

    // ② the wheel: camera speed while flying (whole notches), else one dolly step along the view per notch
    if (Flying || (Pointer.Hovered && !Pointer.Active))
    {
        Flight.WheelRemainder += Pointer.WheelNotches;
        const double Notches = std::trunc(Flight.WheelRemainder);
        Flight.WheelRemainder -= Notches;
        if (Flying)
        {
            Flight.SpeedSetting = std::clamp(Flight.SpeedSetting + static_cast<int>(Notches), 1, 8);
        }
        else if (Notches != 0.0)
        {
            const double Metres = Notches * WheelDollyMetres;
            Translate(Flight.ResolveForward(), Metres);
            Flight.PivotDistance = std::max(1.0, Flight.PivotDistance - Metres);
        }
    }
    else
    {
        Flight.WheelRemainder = 0.0;
    }

    // ③ flight: W/S along the view, D/A along screen right, E/Q along world z, R/F along the view's up; Shift doubles
    //    the speed. Velocity approaches Unreal's terminal speed (acceleration ÷ damping) with damping's time constant,
    //    independent of the tick length, and decays the same way once the keys or the right button are released.
    std::array<double, 3> Thrust = {0.0, 0.0, 0.0};
    if (Flying)
    {
        const std::array<double, 3> Forward = Flight.ResolveForward();
        const std::array<double, 3> Lateral = Flight.ResolveLateral();
        const std::array<double, 3> Upward  = ResolveUpward();
        const auto&                 Keys    = Pointer.FlightKeys;
        const double Along    = (Keys[0] ? 1.0 : 0.0) - (Keys[1] ? 1.0 : 0.0);
        const double Across   = (Keys[3] ? 1.0 : 0.0) - (Keys[2] ? 1.0 : 0.0);
        const double Vertical = (Keys[4] ? 1.0 : 0.0) - (Keys[5] ? 1.0 : 0.0);
        const double Local    = (Keys[6] ? 1.0 : 0.0) - (Keys[7] ? 1.0 : 0.0);
        for (int Component = 0; Component < 3; ++Component)
        {
            Thrust[Component] = Forward[Component] * Along + Lateral[Component] * Across + Upward[Component] * Local + (Component == 2 ? Vertical : 0.0);
        }
    }
    const double TerminalScale = FlightAcceleration / FlightDamping * Speed * (Pointer.ShiftDown ? ShiftBoost : 1.0);
    const double Decay         = std::exp(-FlightDamping * Δt);
    for (int Component = 0; Component < 3; ++Component)
    {
        const double Terminal       = Thrust[Component] * TerminalScale;
        const double Previous       = Flight.Velocity[Component];
        Flight.Velocity[Component]  = Terminal + (Previous - Terminal) * Decay;
        // 📝 Exact displacement of the exponential approach over the tick.
        Flight.Position[Component] += Terminal * Δt + (Previous - Terminal) * (1.0 - Decay) / FlightDamping;
        if (std::fabs(Flight.Velocity[Component]) < 1.0e-4 && Terminal == 0.0) Flight.Velocity[Component] = 0.0;
    }

    // ④ Z widens and C narrows the field of view while flying; it recoils to rest once the flight ends (Unreal's FOV recoil)
    if (Flying)
    {
        const double Impulse      = (Pointer.FlightKeys[8] ? 1.0 : 0.0) - (Pointer.FlightKeys[9] ? 1.0 : 0.0);
        const double TerminalRate = Impulse * FieldOfViewAcceleration / FieldOfViewDamping;
        Flight.FieldOfViewRate    = TerminalRate + (Flight.FieldOfViewRate - TerminalRate) * std::exp(-FieldOfViewDamping * Δt);
        const double RestDegrees  = Flight.VerticalFieldOfView / DegreesToRadian;
        Flight.FieldOfViewOffset  = std::clamp(Flight.FieldOfViewOffset + Flight.FieldOfViewRate * Δt, 5.0 - RestDegrees, 140.0 - RestDegrees);
    }
    else
    {
        Flight.FieldOfViewRate    = 0.0;
        Flight.FieldOfViewOffset *= std::exp(-FieldOfViewDamping * Δt);
        if (std::fabs(Flight.FieldOfViewOffset) < 0.01) Flight.FieldOfViewOffset = 0.0;
    }

    // ⑤ F frames the level's default view again (the viewport has no selection to focus); the speed setting stays
    if (Pointer.RecentrePress)
    {
        const int SpeedSetting = Flight.SpeedSetting;
        Flight                 = SceneViewportFlight{};
        Flight.SpeedSetting    = SpeedSetting;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    CONSTRUCTION & LIFECYCLE
//------------------------------------------------------------------------------------------------------------------------

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

EverestWorkspace::EverestWorkspace(Frontier::ControlCentrePanel& ControlCentre,
                                   std::filesystem::path         ProjectRootPath)
    : Centre(ControlCentre)
    , InspectorPanel(OutlinerPanel)
    , ProjectRoot(std::move(ProjectRootPath))
{
    InitializeWorld();

    OutlinerPanel.ConfigureConstructibleTypes(QuerySceneWorld().EnumerateRegisteredTypes());
    OutlinerPanel.Synchronize(Frontier::SceneDirectory::Instance());

    if (Frontier::SceneRecordBase* Solar = QuerySceneWorld().FindFirstByType("Solar"))
    {
        OutlinerPanel.Select(Solar->QueryToken());
        OutlinerPanel.Synchronize(Frontier::SceneDirectory::Instance());
    }

    Dockspace.ConfigureDockspaceKey("EverestWorkspaceDockspace");
    Dockspace.ConfigureWorkspaceInsets(50.0f, Frontier::ViewportChromeControls::StatusStripHeight);

    if (!Dockspace.Register(Frontier::MakeSceneDirectoryPanelSpecification(OutlinerPanel)) ||
        !Dockspace.Register({"Viewport", "Viewport", [this]() { ConstructViewportSurface(); }, true}) ||
        !Dockspace.Register(Frontier::MakeLogStreamPanelSpecification(LogPanel)) ||
        !Dockspace.Register(Frontier::MakeSceneInspectorPanelSpecification(InspectorPanel)))
    {
        throw std::runtime_error("EverestWorkspace dockspace registration refused.");
    }

    (void)Dockspace.ConfigureStackedPanels("Viewport", "LogStream", 520.0f);
    (void)Dockspace.ConfigureColumns({
        {"Outliner", 0.200f},
        {"LogStream", 0.545f},
        {"Inspector", 0.255f},
    });

    ImGui::GetIO().IniFilename = nullptr;
    ObservedLayoutRevision     = Centre.QueryLayoutResetRevision();
}

#else

EverestWorkspace::EverestWorkspace(std::filesystem::path ProjectRootPath)
    : ProjectRoot(std::move(ProjectRootPath))
{
    InitializeWorld();
}

#endif

EverestWorkspace::~EverestWorkspace()
{
#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)
    ReleasePointerConstraint();
#endif
}

void EverestWorkspace::InitializeWorld()
{
    const uint32_t ProjectCategory = EnsureProjectLogCategory("Everest");
    (void)EnsureProjectLogCategory("Physics");

    const std::filesystem::path ProjectSpacePath = ProjectRoot / "Everest.projectspace";
    if (std::filesystem::exists(ProjectSpacePath))
    {
        if (Application.Initialize(ProjectSpacePath, &Diagnostic))
        {
            ActiveLevelPath = QuerySceneWorld().QueryLoadedLevelPath();
#if FRONTIER_EDITOR
            Frontier::SceneDirectory::Instance().ConfigureActiveSceneHeader(
                ActiveLevelPath.stem().string(), "Frontier LevelSpace");
#endif
            Frontier::WriteLogFormat(ProjectCategory, Frontier::LogSeverity::Info, Frontier::LogVerbosity::Log,
                                     "EverestWorkspace", "Loaded '%s' (%zu scene records).",
                                     ActiveLevelPath.filename().string().c_str(),
                                     QuerySceneWorld().QueryRecordCount());
        }
        else
        {
            Frontier::WriteLogFormat(ProjectCategory, Frontier::LogSeverity::Error, Frontier::LogVerbosity::Log,
                                     "EverestWorkspace", "Project startup failed: %s", Diagnostic.c_str());
        }
    }
    else
    {
        ActiveLevelPath = ProjectRoot / "Content" / "Levels" / "Default.levelspace";
        RegisterEverestSimulationTypes(QuerySceneWorld());
        if (std::filesystem::exists(ActiveLevelPath) && QuerySceneWorld().LoadLevelSpace(ActiveLevelPath, &Diagnostic))
        {
#if FRONTIER_EDITOR
            Frontier::SceneDirectory::Instance().ConfigureActiveSceneHeader(
                ActiveLevelPath.stem().string(), "Frontier LevelSpace");
#endif
        }
        else
        {
            Diagnostic = "Project container missing: " + ProjectSpacePath.string();
            Frontier::WriteLogFormat(ProjectCategory, Frontier::LogSeverity::Warning, Frontier::LogVerbosity::Log,
                                     "EverestWorkspace", "Initialized empty SceneWorld (%s).", Diagnostic.c_str());
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    RUNTIME SIMULATION
//------------------------------------------------------------------------------------------------------------------------

void EverestWorkspace::IntegrateSimulation(double DeltaSeconds)
{
    const float ClampedDt = static_cast<float>(std::clamp(DeltaSeconds, 0.0, 0.25));
    ElapsedSeconds += static_cast<double>(ClampedDt);

    Application.StepFrame(ClampedDt);

    if (auto* DiagRecord = dynamic_cast<Frontier::DiagnosticsRecord*>(QuerySceneWorld().FindFirstByType("Diagnostics")))
    {
        if (ClampedDt > 1.0e-5f)
        {
            auto& Diag           = DiagRecord->AccessConfiguration();
            const float Instant  = ClampedDt * 1000.0f;
            Diag.FrameTimeMs     = Diag.FrameTimeMs * 0.9f + Instant * 0.1f;
            Diag.FramesPerSecond = 1000.0f / std::max(0.25f, Diag.FrameTimeMs);
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    EDITOR INTERFACE
//------------------------------------------------------------------------------------------------------------------------

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

bool EverestWorkspace::ConfigurePlatform() noexcept
{
    Dockspace.ConfigureDetachedWindows(Centre.QueryDetachedWindows());
    return Dockspace.ConfigurePlatform();
}

void EverestWorkspace::ServiceDynamicSceneRequests()
{
    const uint32_t ProjectCategory = EnsureProjectLogCategory("Everest");
    bool           Mutated         = false;

    while (const auto RequestedType = OutlinerPanel.ConsumeConstructRequest())
    {
        Frontier::RecordToken ParentToken{};
        if (*RequestedType == "OpticalFlare")
        {
            if (Frontier::SceneRecordBase* Solar = QuerySceneWorld().FindFirstByType("Solar"))
            {
                ParentToken = Solar->QueryToken();
            }
        }
        const Frontier::RecordToken Created = QuerySceneWorld().ConstructRecord(*RequestedType, {}, ParentToken);
        if (Created.IsValid())
        {
            OutlinerPanel.Synchronize(Frontier::SceneDirectory::Instance());
            OutlinerPanel.Select(Created);
            Mutated = true;
            Frontier::WriteLogFormat(ProjectCategory, Frontier::LogSeverity::Info, Frontier::LogVerbosity::Log,
                                     "EverestWorkspace", "Added record '%s' (type '%s', token #%llu).",
                                     Frontier::SceneDirectory::Instance().QueryName(Created).c_str(),
                                     RequestedType->c_str(),
                                     static_cast<unsigned long long>(Created.Value));
        }
    }

    while (const auto DeleteToken = OutlinerPanel.ConsumeDeleteRequest())
    {
        const std::string OldName = Frontier::SceneDirectory::Instance().QueryName(*DeleteToken);
        if (QuerySceneWorld().DestroyRecord(*DeleteToken))
        {
            Mutated = true;
            Frontier::WriteLogFormat(ProjectCategory, Frontier::LogSeverity::Info, Frontier::LogVerbosity::Log,
                                     "EverestWorkspace", "Removed record '%s' (token #%llu).",
                                     OldName.c_str(),
                                     static_cast<unsigned long long>(DeleteToken->Value));
        }
    }

    if (Mutated)
    {
        OutlinerPanel.Synchronize(Frontier::SceneDirectory::Instance());
    }
}

void EverestWorkspace::ConstructInterface(double DeltaSeconds)
{
    IntegrateSimulation(DeltaSeconds);
    ViewportDeltaSeconds = DeltaSeconds;

    if (ObservedLayoutRevision != Centre.QueryLayoutResetRevision())
    {
        ObservedLayoutRevision = Centre.QueryLayoutResetRevision();
        Dockspace.ResetLayout();
        (void)Dockspace.ConfigureStackedPanels("Viewport", "LogStream", 520.0f);
        (void)Dockspace.ConfigureColumns({
            {"Outliner", 0.200f},
            {"LogStream", 0.545f},
            {"Inspector", 0.255f},
        });
    }

    ServiceDynamicSceneRequests();
    OutlinerPanel.Synchronize(Frontier::SceneDirectory::Instance());
    LogPanel.Synchronize(Frontier::LogStore(), Frontier::LogCategories(), DeltaSeconds);

    // 📝 The readout's frame figures: a 0.9 / 0.1 smoothed tick and the last 240 ticks for the 1 % low (IlluminationHost.js).
    if (DeltaSeconds > 0.0)
    {
        FrameSeconds = FrameSeconds <= 0.0 ? DeltaSeconds : FrameSeconds * 0.9 + DeltaSeconds * 0.1;
        FrameDurations[FrameDurationCursor] = static_cast<float>(DeltaSeconds * 1000.0);
        FrameDurationCursor                 = (FrameDurationCursor + 1) % FrameDurations.size();
    }
    NoticeSeconds = std::max(0.0, NoticeSeconds - std::max(0.0, DeltaSeconds));

    const float Scale = Centre.QueryAppearance().QueryApplied().InterfaceScale / 100.0f;
    ConstructTopToolbar(Scale);
    Dockspace.ConstructInterface(Scale);
    ConstructStatusStrip(Scale);
    Frontier::InspectorRuntime::Instance().ConstructActiveEditor();
}

void EverestWorkspace::ConstructTopToolbar(float Scale)
{
    const Frontier::InspectorPalette Palette = Frontier::InspectorPalette::Resolve();
    const Frontier::EditorTypefaces  Faces   = Frontier::EditorTypefaces::Resolve();
    const ImGuiViewport*             MainVp  = ImGui::GetMainViewport();
    const ImVec2                     BarPos  = MainVp->Pos;
    const ImVec2                     BarSize(MainVp->Size.x, 50.0f);

    ImGui::SetNextWindowPos(BarPos, ImGuiCond_Always);
    ImGui::SetNextWindowSize(BarSize, ImGuiCond_Always);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.0f, 0.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.0f);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, ImGui::ColorConvertU32ToFloat4(Palette.ColumnBg));
    if (ImGui::Begin("##EverestTopToolbar", nullptr,
                     ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove |
                         ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoDocking |
                         ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoBringToFrontOnFocus))
    {
        ImDrawList* DrawList = ImGui::GetWindowDrawList();
        DrawList->AddLine(ImVec2(BarPos.x, BarPos.y + BarSize.y - 1.0f),
                          ImVec2(BarPos.x + BarSize.x, BarPos.y + BarSize.y - 1.0f),
                          Palette.EdgeBorder, 1.0f);

        float       CursorX = BarPos.x + 14.0f;
        const float BtnY    = BarPos.y + 10.0f;
        const float BtnH    = 30.0f;

        {
            const float BackW = 104.0f;
            ImGui::SetCursorScreenPos(ImVec2(CursorX, BtnY));
            if (ImGui::InvisibleButton("##ReturnProjectsBtn", ImVec2(BackW, BtnH)) && EvaluateReturnToBrowser)
            {
                EvaluateReturnToBrowser();
            }
            const bool Hover = ImGui::IsItemHovered();
            DrawList->AddRectFilled(ImVec2(CursorX, BtnY), ImVec2(CursorX + BackW, BtnY + BtnH),
                                    Hover ? Palette.SegmentedActiveBg : Palette.CountCardBg, 8.0f);
            DrawList->AddRect(ImVec2(CursorX, BtnY), ImVec2(CursorX + BackW, BtnY + BtnH), Palette.CountCardBorder, 8.0f);
            Frontier::ConstructEditorGlyph(DrawList, ImVec2(CursorX + 15.0f, BtnY + BtnH * 0.5f), 4.5f,
                                           Palette.TextSecondary, "ChevronRight", 1.4f);
            DrawList->AddText(Faces.Medium, 11.5f * Scale, ImVec2(CursorX + 26.0f, BtnY + 8.5f),
                              Palette.TextPrimary, "Projects");
            CursorX += BackW + 14.0f;
        }

        Frontier::ConstructEditorGlyph(DrawList, ImVec2(CursorX + 8.0f, BarPos.y + 25.0f), 7.0f,
                                       Palette.ThemeAccent, "Layers", 1.5f);
        DrawList->AddText(Faces.SemiBold, 13.5f, ImVec2(CursorX + 22.0f, BarPos.y + 17.0f),
                          Palette.TextPrimary, "Everest");
        CursorX += 22.0f + MeasureLabelWidth(Faces.SemiBold, 13.5f, "Everest") + 12.0f;

        const std::string LevelFilename = ActiveLevelPath.empty()
                                              ? std::string("Default.levelspace")
                                              : ActiveLevelPath.filename().string();
        char LevelBadge[128]{};
        std::snprintf(LevelBadge, sizeof(LevelBadge), "%s · %zu records",
                      LevelFilename.c_str(), QuerySceneWorld().QueryRecordCount());
        const float BadgeW = MeasureLabelWidth(Faces.Monospace, 10.5f, LevelBadge) + 18.0f;
        DrawList->AddRectFilled(ImVec2(CursorX, BtnY + 3.0f), ImVec2(CursorX + BadgeW, BtnY + BtnH - 3.0f),
                                Palette.InsetFieldBg, 6.0f);
        DrawList->AddRect(ImVec2(CursorX, BtnY + 3.0f), ImVec2(CursorX + BadgeW, BtnY + BtnH - 3.0f),
                          Palette.InsetFieldBorder, 6.0f);
        DrawList->AddText(Faces.Monospace, 10.5f, ImVec2(CursorX + 9.0f, BtnY + 9.0f),
                          Palette.TextSecondary, LevelBadge);

        float RightX = BarPos.x + BarSize.x - 14.0f;

        {
            const float SettingsW = 148.0f;
            RightX -= SettingsW;
            ImGui::SetCursorScreenPos(ImVec2(RightX, BtnY));
            if (ImGui::InvisibleButton("##EverestOpenAppearanceBtn", ImVec2(SettingsW, BtnH)))
            {
                Centre.ActivateSettingsPage(Frontier::ControlCentrePageCategory::Appearance);
            }
            const bool Hover = ImGui::IsItemHovered();
            DrawList->AddRectFilled(ImVec2(RightX, BtnY), ImVec2(RightX + SettingsW, BtnY + BtnH),
                                    Hover ? Palette.SegmentedActiveBg : Palette.CountCardBg, 8.0f);
            DrawList->AddRect(ImVec2(RightX, BtnY), ImVec2(RightX + SettingsW, BtnY + BtnH),
                              Palette.CountCardBorder, 8.0f);
            Frontier::ConstructEditorGlyph(DrawList, ImVec2(RightX + 16.0f, BtnY + BtnH * 0.5f), 6.0f,
                                           Palette.ThemeAccent, "Sliders", 1.4f);
            DrawList->AddText(Faces.Medium, 11.0f, ImVec2(RightX + 29.0f, BtnY + 9.0f),
                              Palette.TextPrimary, "Control Centre");
            RightX -= 10.0f;
        }

        {
            const float SaveW = 132.0f;
            RightX -= SaveW;
            ImGui::SetCursorScreenPos(ImVec2(RightX, BtnY));
            if (ImGui::InvisibleButton("##EverestSaveLevelBtn", ImVec2(SaveW, BtnH)))
            {
                std::string    SaveDiag;
                const uint32_t ProjectCategory = EnsureProjectLogCategory("Everest");
                const std::filesystem::path TargetPath = ActiveLevelPath.empty()
                                                             ? (ProjectRoot / "Content" / "Levels" / "Default.levelspace")
                                                             : ActiveLevelPath;
                if (QuerySceneWorld().SaveLevelSpace(TargetPath, &SaveDiag))
                {
                    ActiveLevelPath = TargetPath;
                    Frontier::WriteLogFormat(ProjectCategory, Frontier::LogSeverity::Info, Frontier::LogVerbosity::Log,
                                             "EverestWorkspace", "Saved '%s' (%zu records).",
                                             TargetPath.filename().string().c_str(),
                                             QuerySceneWorld().QueryRecordCount());
                }
                else
                {
                    Diagnostic = SaveDiag;
                    Frontier::WriteLogFormat(ProjectCategory, Frontier::LogSeverity::Error, Frontier::LogVerbosity::Log,
                                             "EverestWorkspace", "Save failed: %s", SaveDiag.c_str());
                }
            }
            const bool Hover = ImGui::IsItemHovered();
            DrawList->AddRectFilled(ImVec2(RightX, BtnY), ImVec2(RightX + SaveW, BtnY + BtnH),
                                    Hover ? Palette.SegmentedActiveBg : Palette.CountCardBg, 8.0f);
            DrawList->AddRect(ImVec2(RightX, BtnY), ImVec2(RightX + SaveW, BtnY + BtnH),
                              Palette.CountCardBorder, 8.0f);
            DrawList->AddText(Faces.Medium, 11.0f, ImVec2(RightX + 14.0f, BtnY + 9.0f),
                              Palette.TextSecondary, "Save .levelspace");
            RightX -= 10.0f;
        }

        {
            const auto* PipelineRecord = dynamic_cast<const Frontier::RenderPipelineRecord*>(
                const_cast<Frontier::SceneWorld&>(QuerySceneWorld()).FindFirstByType("RenderPipeline"));
            const char* TierText = "TIER: RTX (VK_KHR_ray_query)";
            ImU32       TierTint = Palette.LiveGreen;
            if (PipelineRecord != nullptr && !PipelineRecord->QueryConfiguration().HardwareRayQueryTier)
            {
                TierText = "TIER: GTX (4-Cascade SDF + SAH-2 BVH)";
                TierTint = Palette.WarmAmber;
            }
            const float PillW = MeasureLabelWidth(Faces.Monospace, 10.0f, TierText) + 26.0f;
            RightX -= PillW;
            DrawList->AddRectFilled(ImVec2(RightX, BtnY + 3.0f), ImVec2(RightX + PillW, BtnY + BtnH - 3.0f),
                                    Frontier::ModulateSpectrumAlpha(TierTint, 0.14f), 6.0f);
            DrawList->AddRect(ImVec2(RightX, BtnY + 3.0f), ImVec2(RightX + PillW, BtnY + BtnH - 3.0f),
                              Frontier::ModulateSpectrumAlpha(TierTint, 0.45f), 6.0f);
            DrawList->AddCircleFilled(ImVec2(RightX + 10.0f, BtnY + BtnH * 0.5f), 3.0f, TierTint);
            DrawList->AddText(Faces.Monospace, 10.0f, ImVec2(RightX + 18.0f, BtnY + 9.0f), TierTint, TierText);
        }
    }
    ImGui::End();
    ImGui::PopStyleColor();
    ImGui::PopStyleVar(2);
}

void EverestWorkspace::IntegrateViewportCamera(bool Hovered, bool Active, double DeltaSeconds)
{
    // 📝 Unreal Engine's perspective viewport navigation (IntegrateSceneViewportFlight); this reads one tick of ImGui input.
    //    Called right after the viewport's invisible button, so SetItemKeyOwner claims keys for that button.
    const ImGuiIO&       IO = ImGui::GetIO();
    SceneViewportPointer Pointer;
    Pointer.Hovered      = Hovered;
    Pointer.Active       = Active;
    Pointer.LeftDown     = ImGui::IsMouseDown(ImGuiMouseButton_Left);
    Pointer.RightDown    = ImGui::IsMouseDown(ImGuiMouseButton_Right);
    Pointer.MiddleDown   = ImGui::IsMouseDown(ImGuiMouseButton_Middle);
    Pointer.AltDown      = IO.KeyAlt;
    Pointer.ShiftDown    = IO.KeyShift;
    Pointer.MotionPixels = {static_cast<double>(IO.MouseDelta.x), static_cast<double>(IO.MouseDelta.y)};
    Pointer.WheelNotches = (Hovered || Active) ? static_cast<double>(IO.MouseWheel) : 0.0;

    // 📝 Unreal's keys per flight axis: forward, back, left, right, up and down (world z), up and down (view), widen, narrow.
    static constexpr std::array<std::array<ImGuiKey, 3>, 10> FlightKeyTable = {{
        {ImGuiKey_W, ImGuiKey_UpArrow, ImGuiKey_Keypad8},
        {ImGuiKey_S, ImGuiKey_DownArrow, ImGuiKey_Keypad2},
        {ImGuiKey_A, ImGuiKey_LeftArrow, ImGuiKey_Keypad4},
        {ImGuiKey_D, ImGuiKey_RightArrow, ImGuiKey_Keypad6},
        {ImGuiKey_E, ImGuiKey_PageUp, ImGuiKey_Keypad9},
        {ImGuiKey_Q, ImGuiKey_PageDown, ImGuiKey_Keypad7},
        {ImGuiKey_R, ImGuiKey_None, ImGuiKey_None},
        {ImGuiKey_F, ImGuiKey_None, ImGuiKey_None},
        {ImGuiKey_Z, ImGuiKey_Keypad1, ImGuiKey_None},
        {ImGuiKey_C, ImGuiKey_Keypad3, ImGuiKey_None},
    }};
    // 📝 The wheel never scrolls the panel under the viewport; during a camera drag the viewport also owns the flight keys,
    //    so keyboard navigation leaves the arrows and page keys alone.
    (void)ImGui::SetItemKeyOwner(ImGuiKey_MouseWheelY);
    const bool Dragging = Active && (Pointer.LeftDown || Pointer.RightDown || Pointer.MiddleDown);
    for (size_t Axis = 0; Axis < FlightKeyTable.size(); ++Axis)
    {
        for (const ImGuiKey Key : FlightKeyTable[Axis])
        {
            if (Key == ImGuiKey_None) continue;
            if (Dragging) (void)ImGui::SetItemKeyOwner(Key);
            Pointer.FlightKeys[Axis] = Pointer.FlightKeys[Axis] || ImGui::IsKeyDown(Key);
        }
    }
    Pointer.RecentrePress = Hovered && !Pointer.RightDown && ImGui::IsKeyPressed(ImGuiKey_F, false);

    // ⚠️ The first tick after the lock may carry the platform's recentring jump; its motion is dropped.
    if (ConstraintSettleTicks > 0)
    {
        Pointer.MotionPixels = {0.0, 0.0};
        --ConstraintSettleTicks;
    }
    // 📝 Unreal hides and holds the pointer during camera drags and puts it back where the drag began.
    const ImGuiViewport* WindowViewport = ImGui::GetWindowViewport();
    void* const          PlatformWindow = WindowViewport != nullptr ? WindowViewport->PlatformHandle : nullptr;
    if (Dragging && ConstrainedWindow == nullptr && ConstrainPointer && PlatformWindow != nullptr)
    {
        ConstrainPointer(PlatformWindow, true);
        ConstrainedWindow     = PlatformWindow;
        ConstraintSettleTicks = 1;
    }
    else if (!Dragging && ConstrainedWindow != nullptr)
    {
        ReleasePointerConstraint();
    }

    IntegrateSceneViewportFlight(Flight, Pointer, DeltaSeconds);
}

void EverestWorkspace::ReleasePointerConstraint()
{
    if (ConstrainedWindow != nullptr && ConstrainPointer) ConstrainPointer(ConstrainedWindow, false);
    ConstrainedWindow = nullptr;
}

void EverestWorkspace::ConstructViewportSurface()
{
    // 📝 The demo's viewport column (index.html #viewport-column): the viewport bar above the stage; on the stage the
    //    presented image, then the overlays (bring-up, failure, distance slice, readout, notice).
    const float  Scale = Centre.QueryAppearance().QueryApplied().InterfaceScale / 100.0f;
    const ImVec2 Avail = ImGui::GetContentRegionAvail();
    const float  BarH  = Frontier::ViewportChromeControls::BarHeight * Scale;
    const float  W     = std::max(64.0f, Avail.x);
    const float  H     = std::max(64.0f + BarH, Avail.y);
    const ImVec2 Min   = ImGui::GetCursorScreenPos();
    const ImVec2 Max(Min.x + W, Min.y + H);
    const ImVec2 StageMin(Min.x, Min.y + BarH);

    // 📝 The demo's tab strip: "Viewport" and the scene pill (index.html .viewport-tabs).
    if (const ImGuiWindow* Panel = ImGui::GetCurrentWindow(); Panel->DockNode != nullptr && Panel->DockNode->TabBar != nullptr &&
                                                           !Panel->DockNode->IsHiddenTabBar() && Panel->DockNode->VisibleWindow == Panel)
    {
        const ImRect Strip = Panel->DockNode->TabBar->BarRect;
        Frontier::ViewportChromeControls::ConstructScenePill(ImGui::GetForegroundDrawList(Panel->Viewport), Frontier::EditorTypefaces::Resolve(), Strip.Min,
                                                             Strip.Max, "Proving Grounds", Scale);
    }

    ImGui::SetCursorScreenPos(StageMin);
    ImGui::SetNextItemAllowOverlap();
    ImGui::InvisibleButton("##SceneViewportCanvas", ImVec2(W, H - BarH),
                           ImGuiButtonFlags_MouseButtonLeft | ImGuiButtonFlags_MouseButtonRight | ImGuiButtonFlags_MouseButtonMiddle);
    const bool StageHovered = ImGui::IsItemHovered();
    const bool StageActive  = ImGui::IsItemActive();
    IntegrateViewportCamera(StageHovered, StageActive, ViewportDeltaSeconds);

    // 📝 The demo's overlay keys, while the viewport has the pointer or the focus and no text field takes the keys.
    const ImGuiIO& IO = ImGui::GetIO();
    if ((StageHovered || ImGui::IsWindowFocused(ImGuiFocusedFlags_RootAndChildWindows)) && !IO.WantTextInput && !StageActive)
    {
        if (ImGui::IsKeyPressed(ImGuiKey_H, false)) ToggleViewportOverlay(0);
        // 📝 The demo's own labels disagree: the bar says "Distance slice (I)", the inset's close button "(J)", and its key is J
        //    (I cycles the vehicle's lights). With no vehicle here, both toggle the slice.
        if (ImGui::IsKeyPressed(ImGuiKey_I, false) || ImGui::IsKeyPressed(ImGuiKey_J, false)) ToggleViewportOverlay(1);
        if (ImGui::IsKeyPressed(ImGuiKey_V, false)) ToggleViewportOverlay(2);
        if (ImGui::IsKeyPressed(ImGuiKey_F8, false)) AnnounceViewportNotice("Chase follows the vehicle \xE2\x80\x94 this level has no vehicle");
    }

    ImDrawList* DrawList = ImGui::GetWindowDrawList();
    DrawList->PushClipRect(Min, Max, true);

    // 📝 The host renders the level's scene through its records; the schematic stands in until an image exists.
    SceneViewportImage Image;
    if (PresentSceneViewport)
    {
        SceneViewportRequest Request;
        Request.PanelWidth          = W;
        Request.PanelHeight         = H - BarH;
        Request.PixelDensity        = ImGui::GetWindowViewport() != nullptr ? ImGui::GetWindowViewport()->FramebufferScale.y : 1.0f;
        Request.CameraPosition      = Flight.Position;
        Request.CameraTarget        = Flight.ResolveTarget();
        Request.VerticalFieldOfView = Flight.ResolveFieldOfView();
        Request.DeltaSeconds        = ViewportDeltaSeconds;
        Request.DistanceSlice       = Overlays.DistanceSliceVisible && !Overlays.CleanView;
        Image       = PresentSceneViewport(Request);
        LastReadout = Image.Readout;
    }
    if (Image.Texture != 0)
    {
        DrawList->AddImage(static_cast<ImTextureID>(Image.Texture), StageMin, Max);
    }
    else
    {
        ConstructViewportSchematic(DrawList, StageMin, Max);
    }
    ConstructViewportOverlays(StageMin, Max, Image, Scale);
    DrawList->PopClipRect();

    ConstructViewportBar(Min, ImVec2(Max.x, StageMin.y), Scale);
}

void EverestWorkspace::ConstructViewportBar(const ImVec2& Min, const ImVec2& Max, float Scale)
{
    // 📝 EditorControls.js viewport bar, left to right: scene heading, live pill, Particles, camera rigs, inspection view,
    //    then readout, distance slice, respawn, reassemble and clean view against the right edge.
    using Frontier::ViewportChromeControls;
    const Frontier::EditorTypefaces Faces    = Frontier::EditorTypefaces::Resolve();
    ImDrawList*                     DrawList = ImGui::GetWindowDrawList();
    const float                     Height   = Max.y - Min.y;
    const float                     Gap      = ViewportChromeControls::BarGap * Scale;
    ViewportChromeControls::ConstructBarBackground(DrawList, Min, Max, Scale);
    DrawList->PushClipRect(Min, Max, true);

    float Pen = Min.x + ViewportChromeControls::BarPadding * Scale;
    Pen += ViewportChromeControls::ConstructSceneHeading(DrawList, Faces, ImVec2(Pen, Min.y), Height, "Scene",
                                                         "Vulkan \xC2\xB7 distance-field GI \xC2\xB7 ReSTIR", Scale) + Gap;
    if (LastReadout.Presenting)
    {
        Pen += ViewportChromeControls::ConstructLivePill(DrawList, Faces, ImVec2(Pen, Min.y), Height, "LIVE", Scale) + Gap;
    }

    // 📝 Particles opens the level's particle authoring editor (the demo's particle workspace).
    Frontier::SceneRecordBase* Particles  = QuerySceneWorld().FindFirstByType("Particles");
    const bool                 Authorable = Particles != nullptr && Frontier::InspectorRuntime::Instance().QueryHasEditor(Particles->QueryToken());
    const float                ButtonH    = ViewportChromeControls::IconButtonExtent * Scale;
    const float                ParticlesW = ViewportChromeControls::MeasureLabelButton(Faces, "Particles", Scale);
    if (ViewportChromeControls::ConstructLabelButton("##ParticleLaunch", Faces, ImVec2(Pen, Min.y + 0.5f * (Height - ButtonH)), ImVec2(ParticlesW, ButtonH),
                                                     "Particles", Authorable, "Open particle authoring workspace", Scale) &&
        Authorable)
    {
        (void)Frontier::InspectorRuntime::Instance().RequestEditorOpen(Particles->QueryToken());
    }
    Pen += ParticlesW + Gap;

    // 📝 Camera rigs: Chase needs the vehicle, which this level omits; Free is the Unreal Engine viewport camera.
    static const char* const RigOptions[]  = {"Chase", "Free \xC2\xB7 F8"};
    static const char* const RigTooltips[] = {"Chase follows the vehicle \xE2\x80\x94 this level has no vehicle",
                                              "Free camera: Unreal Engine viewport controls (hold the right button + W/A/S/D)"};
    const bool               RigEnabled[]  = {false, true};
    int                      Rig           = 1;
    const float              SegmentedH    = 36.0f * Scale;
    (void)ViewportChromeControls::ConstructSegmentedSwitch("##CameraRig", Faces, ImVec2(Pen, Min.y + 0.5f * (Height - SegmentedH)),
                                                           ImVec2(ViewportChromeControls::SegmentedWidth * Scale, SegmentedH), RigOptions, 2, Rig, RigEnabled,
                                                           RigTooltips, Scale);
    Pen += ViewportChromeControls::SegmentedWidth * Scale + Gap;

    // 📝 The inspection view is the RenderPipeline record's InspectionModeIndex (the demo's Settings.Inspection).
    auto*       Pipeline   = dynamic_cast<Frontier::RenderPipelineRecord*>(QuerySceneWorld().FindFirstByType("RenderPipeline"));
    int         Inspection = Pipeline != nullptr ? std::clamp(Pipeline->QueryConfiguration().InspectionModeIndex, 0, 14) : 0;
    const float SelectH    = 35.0f * Scale;
    if (ViewportChromeControls::ConstructSelectField("##InspectionView", Faces, ImVec2(Pen, Min.y + 0.5f * (Height - SelectH)),
                                                     ImVec2(ViewportChromeControls::SelectWidth * Scale, SelectH), Frontier::RenderInspectionModes::ModeNames,
                                                     static_cast<int>(Frontier::RenderInspectionModes::ModeCount), Inspection, Scale) &&
        Pipeline != nullptr)
    {
        Pipeline->AccessConfiguration().InspectionModeIndex = Inspection;
        Pipeline->AccessConfiguration().AdvanceRevision();
    }
    Pen += ViewportChromeControls::SelectWidth * Scale + Gap;

    const float Icon  = ViewportChromeControls::IconButtonExtent * Scale;
    const float IconY = Min.y + 0.5f * (Height - Icon);
    float       X     = std::max(Pen, Max.x - ViewportChromeControls::BarPadding * Scale - 5.0f * Icon - 4.0f * Gap);
    if (ViewportChromeControls::ConstructIconButton("##Readout", ImVec2(X, IconY), Icon, "Activity", Overlays.ReadoutVisible && !Overlays.CleanView, true,
                                                    "Readout (H)"))
    {
        ToggleViewportOverlay(0);
    }
    X += Icon + Gap;
    if (ViewportChromeControls::ConstructIconButton("##DistanceSlice", ImVec2(X, IconY), Icon, "Grid", Overlays.DistanceSliceVisible && !Overlays.CleanView,
                                                    true, "Distance slice (I)"))
    {
        ToggleViewportOverlay(1);
    }
    X += Icon + Gap;
    (void)ViewportChromeControls::ConstructIconButton("##Respawn", ImVec2(X, IconY), Icon, "RotateCcw", false, false,
                                                      "Respawn (R) \xE2\x80\x94 this level has no vehicle");
    X += Icon + Gap;
    (void)ViewportChromeControls::ConstructIconButton("##Reassemble", ImVec2(X, IconY), Icon, "Undo2", false, false,
                                                      "Reassemble every prop \xE2\x80\x94 no breakable props in this viewport");
    X += Icon + Gap;
    if (ViewportChromeControls::ConstructIconButton("##CleanView", ImVec2(X, IconY), Icon, "ScanCorners", Overlays.CleanView, true, "Clean view (V)"))
    {
        ToggleViewportOverlay(2);
    }
    DrawList->PopClipRect();
}

void EverestWorkspace::ConstructViewportOverlays(const ImVec2& StageMin, const ImVec2& StageMax, const SceneViewportImage& Image, float Scale)
{
    using Frontier::ViewportChromeControls;
    const Frontier::EditorTypefaces Faces    = Frontier::EditorTypefaces::Resolve();
    ImDrawList*                     DrawList = ImGui::GetWindowDrawList();
    const SceneViewportReadout&     Readout  = Image.Readout;

    // ① #failure, or #bring-up while the first image is still to come
    if (!Readout.Failure.empty())
    {
        ViewportChromeControls::ConstructFailurePanel(DrawList, Faces, StageMin, StageMax, Readout.Failure, Scale);
    }
    else if (PresentSceneViewport && Image.Texture == 0)
    {
        ViewportChromeControls::ConstructBringUpCard(DrawList, Faces, StageMin, StageMax, "Frontier \xC2\xB7 Proving Grounds",
                                                     Image.Status.empty() ? "Starting" : Image.Status.c_str(), 0.0f, Scale);
    }
    const bool Overlaid = !Overlays.CleanView && Image.Texture != 0;

    // ② #inset-frame: the distance slice DisplayPresent draws, 0.34 of the image height at the top-right, 16 px in
    if (Overlaid && Overlays.DistanceSliceVisible && Readout.ScreenExtent[0] > 0 && Readout.ScreenExtent[1] > 0)
    {
        const float  ToPanelX = (StageMax.x - StageMin.x) / static_cast<float>(Readout.ScreenExtent[0]);
        const float  ToPanelY = (StageMax.y - StageMin.y) / static_cast<float>(Readout.ScreenExtent[1]);
        const float  Size     = std::floor(static_cast<float>(Readout.ScreenExtent[1]) * 0.34f);
        const ImVec2 InsetMin(StageMin.x + (static_cast<float>(Readout.ScreenExtent[0]) - Size - 16.0f) * ToPanelX, StageMin.y + 16.0f * ToPanelY);
        const ImVec2 InsetMax(InsetMin.x + Size * ToPanelX, InsetMin.y + Size * ToPanelY);
        if (ViewportChromeControls::ConstructInsetFrame("##InsetFrame", Faces, InsetMin, InsetMax,
                                                        "GDF slice \xC2\xB7 blue inside \xC2\xB7 amber outside \xC2\xB7 magenta = rewritten by a moving occupant "
                                                        "\xC2\xB7 teal = scrolled \xC2\xB7 green = cascade 0",
                                                        "Hide the distance slice (J)", Scale))
        {
            ToggleViewportOverlay(1);
        }
    }

    // ③ #hud: the readout lines of the demo's PresentMeasurements, with this viewport's camera keys
    if (Overlaid && Overlays.ReadoutVisible)
    {
        std::vector<float> Durations;
        for (const float Duration : FrameDurations)
            if (Duration > 0.0f) Durations.push_back(Duration);
        std::sort(Durations.begin(), Durations.end());
        const float Slowest = Durations.empty() ? 0.0f : Durations[std::min(Durations.size() - 1, static_cast<size_t>(0.99 * static_cast<double>(Durations.size())))];
        char        Low[16];
        if (Slowest > 0.0f) std::snprintf(Low, sizeof(Low), "%.0f", 1000.0 / static_cast<double>(Slowest));
        else std::snprintf(Low, sizeof(Low), "\xE2\x80\x93");
        char First[256];
        std::snprintf(First, sizeof(First), "%.0f fps \xC2\xB7 %.1f ms \xC2\xB7 1%% low %s fps \xC2\xB7 %u\xC3\x97%u \xC2\xB7 trace %u\xC3\x97%u \xC2\xB7 %s",
                      1.0 / std::max(FrameSeconds, 1.0e-4), FrameSeconds * 1000.0, Low, Readout.ScreenExtent[0], Readout.ScreenExtent[1],
                      Readout.TraceExtent[0], Readout.TraceExtent[1], Readout.RendererTag.c_str());
        std::vector<std::string> Lines;
        Lines.emplace_back(First);
        Lines.emplace_back("ControlVehicle  omitted (this level has no vehicle)");
        if (!Readout.AccelerationLine.empty()) Lines.push_back(Readout.AccelerationLine);
        char Camera[160];
        std::snprintf(Camera, sizeof(Camera), "Camera  speed %d (%g\xC3\x97) \xC2\xB7 field of view %.0f\xC2\xB0", Flight.SpeedSetting,
                      SceneViewportFlight::ResolveSpeed(Flight.SpeedSetting), Flight.ResolveFieldOfView() * 57.29577951308232);
        Lines.emplace_back(Camera);
        Lines.emplace_back("RMB look  RMB+W/A/S/D fly  E/Q up\xC2\xB7" "down  RMB+wheel speed  Shift \xC3\x97" "2  Alt orbit  F start view");
        Lines.emplace_back("H readout  I distance slice  V clean view");
        if (ViewportChromeControls::ConstructReadoutOverlay("##Readout", Faces, StageMin, StageMax, Lines, "Hide the readout (H)", Scale))
        {
            ToggleViewportOverlay(0);
        }
    }

    // ④ #overlay-notice: transient lines (camera speed, clean view)
    if (AnnouncedSpeedSetting != Flight.SpeedSetting)
    {
        AnnouncedSpeedSetting = Flight.SpeedSetting;
        char Speed[64];
        std::snprintf(Speed, sizeof(Speed), "Camera speed %d (%g\xC3\x97)", Flight.SpeedSetting, SceneViewportFlight::ResolveSpeed(Flight.SpeedSetting));
        AnnounceViewportNotice(Speed);
    }
    if (NoticeSeconds > 0.0 && !NoticeText.empty())
    {
        ViewportChromeControls::ConstructOverlayNotice(DrawList, Faces, StageMin, StageMax, NoticeText.c_str(), Scale);
    }
}

void EverestWorkspace::ToggleViewportOverlay(int Overlay)
{
    // 📝 OverlayDock.js Toggle: asking for one overlay out of the clean view brings the view back first, then shows it.
    if (Overlay == 2)
    {
        Overlays.CleanView = !Overlays.CleanView;
        if (Overlays.CleanView) AnnounceViewportNotice("Clean view \xE2\x80\x94 press V to bring the overlays back");
        return;
    }
    bool& Visible = Overlay == 0 ? Overlays.ReadoutVisible : Overlays.DistanceSliceVisible;
    if (Overlays.CleanView)
    {
        Overlays.CleanView = false;
        Visible            = true;
    }
    else
    {
        Visible = !Visible;
    }
}

void EverestWorkspace::AnnounceViewportNotice(std::string Text)
{
    NoticeText    = std::move(Text);
    NoticeSeconds = 2.4;
}

void EverestWorkspace::ConstructStatusStrip(float Scale)
{
    // 📝 index.html footer#status (EditorShell.js items): realtime, frame, quality, sun, speed, smoke, fragments, camera … GPU.
    const Frontier::EditorTypefaces Faces = Frontier::EditorTypefaces::Resolve();
    const ImGuiViewport*            Main  = ImGui::GetMainViewport();
    const float                     StripH = Frontier::ViewportChromeControls::StatusStripHeight * Scale;
    const ImVec2                    StripMin(Main->Pos.x, Main->Pos.y + Main->Size.y - StripH);
    const ImVec2                    StripMax(Main->Pos.x + Main->Size.x, Main->Pos.y + Main->Size.y);
    ImGui::SetNextWindowPos(StripMin, ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(StripMax.x - StripMin.x, StripH), ImGuiCond_Always);
    ImGui::SetNextWindowViewport(Main->ID);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.0f, 0.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.0f);
    if (ImGui::Begin("##EverestStatusStrip", nullptr,
                     ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoDocking |
                         ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoBringToFrontOnFocus | ImGuiWindowFlags_NoInputs | ImGuiWindowFlags_NoBackground))
    {
        char Realtime[32], Frame[32], Sun[32], Camera[64];
        std::snprintf(Realtime, sizeof(Realtime), "%.0f fps", 1.0 / std::max(FrameSeconds, 1.0e-4));
        std::snprintf(Frame, sizeof(Frame), "%.1f ms", LastReadout.RefreshMilliseconds > 0.0 ? LastReadout.RefreshMilliseconds : FrameSeconds * 1000.0);
        double Elevation = 0.0;
        if (const auto* Solar = dynamic_cast<const Frontier::SolarRecord*>(QuerySceneWorld().FindFirstByType("Solar")))
            Elevation = Solar->QueryConfiguration().ElevationDegrees;
        std::snprintf(Sun, sizeof(Sun), "%.1f\xC2\xB0", Elevation);
        std::snprintf(Camera, sizeof(Camera), "%.0f, %.0f, %.0f", Flight.Position[0], Flight.Position[1], Flight.Position[2]);
        const std::vector<Frontier::ViewportStatusItem> Leading = {
            {"REALTIME", Realtime},
            {"FRAME", Frame},
            {"QUALITY", LastReadout.Quality.empty() ? std::string("\xE2\x80\x93") : LastReadout.Quality},
            {"SUN", Sun},
            {"SPEED", "\xE2\x80\x93"},
            {"SMOKE", "idle"},
            {"FRAGMENTS", "0"},
            {"CAM", Camera},
        };
        const std::vector<Frontier::ViewportStatusItem> Trailing = {
            {"GPU", LastReadout.Adapter.empty() ? std::string("\xE2\x80\x93") : LastReadout.Adapter},
        };
        Frontier::ViewportChromeControls::ConstructStatusStrip(ImGui::GetWindowDrawList(), Faces, StripMin, StripMax, Leading, Trailing, Scale);
    }
    ImGui::End();
    ImGui::PopStyleVar(2);
}

void EverestWorkspace::ConstructViewportSchematic(ImDrawList* DrawList, const ImVec2& Min, const ImVec2& Max)
{
    const Frontier::InspectorPalette Palette = Frontier::InspectorPalette::Resolve();
    const float W = Max.x - Min.x;
    const float H = Max.y - Min.y;

    float SunElevation = 38.0f;
    float SunAzimuth   = 132.0f;
    if (const auto* SolarRec = dynamic_cast<const Frontier::SolarRecord*>(QuerySceneWorld().FindFirstByType("Solar")))
    {
        SunElevation = SolarRec->QueryConfiguration().ElevationDegrees;
        SunAzimuth   = SolarRec->QueryConfiguration().AzimuthDegrees;
    }

    const float DayFactor  = std::clamp((SunElevation + 6.0f) / 55.0f, 0.05f, 1.0f);
    const ImU32 ZenithCol  = IM_COL32(static_cast<int>(14 + 28 * DayFactor),
                                      static_cast<int>(22 + 54 * DayFactor),
                                      static_cast<int>(38 + 92 * DayFactor), 255);
    const ImU32 HorizonCol = IM_COL32(static_cast<int>(28 + 86 * DayFactor),
                                      static_cast<int>(38 + 96 * DayFactor),
                                      static_cast<int>(54 + 108 * DayFactor), 255);
    const ImU32 GroundNear = IM_COL32(19, 22, 27, 255);
    const ImU32 GroundFar  = IM_COL32(28, 33, 41, 255);

    const float HorizonY = Min.y + H * 0.56f;
    DrawList->AddRectFilledMultiColor(Min, ImVec2(Max.x, HorizonY), ZenithCol, ZenithCol, HorizonCol, HorizonCol);
    DrawList->AddRectFilledMultiColor(ImVec2(Min.x, HorizonY), Max, GroundFar, GroundFar, GroundNear, GroundNear);
    DrawList->AddLine(ImVec2(Min.x, HorizonY), ImVec2(Max.x, HorizonY),
                      Frontier::ModulateSpectrumAlpha(Palette.TextSecondary, 0.35f), 1.0f);

    // Analytical directional sun disc above the horizon.
    if (SunElevation > -2.0f)
    {
        const float AzNorm = std::fmod(SunAzimuth, 360.0f) / 360.0f;
        const float SunX   = Min.x + W * (0.18f + 0.64f * AzNorm);
        const float SunY   = HorizonY - (std::clamp(SunElevation, 0.0f, 90.0f) / 90.0f) * (HorizonY - Min.y - 36.0f);
        DrawList->AddCircleFilled(ImVec2(SunX, SunY), 22.0f, IM_COL32(255, 222, 148, 38), 32);
        DrawList->AddCircleFilled(ImVec2(SunX, SunY), 8.5f, IM_COL32(255, 244, 214, 235), 24);
    }

    // Perspective metric reference plane (clean general-purpose 3D viewport floor grid).
    const float  VanishX  = (Min.x + Max.x) * 0.5f;
    const ImU32  GridLine = IM_COL32(130, 145, 168, 34);
    const ImU32  AxisX    = IM_COL32(214, 92, 92, 130);
    const ImU32  AxisZ    = IM_COL32(88, 152, 224, 130);
    for (int LineIdx = -12; LineIdx <= 12; ++LineIdx)
    {
        const float TopOffset    = static_cast<float>(LineIdx) * (W * 0.014f);
        const float BottomOffset = static_cast<float>(LineIdx) * (W * 0.095f);
        const ImU32 Tint         = (LineIdx == 0) ? AxisZ : GridLine;
        DrawList->AddLine(ImVec2(VanishX + TopOffset, HorizonY),
                          ImVec2(VanishX + BottomOffset, Max.y),
                          Tint, LineIdx == 0 ? 1.5f : 1.0f);
    }
    for (int Row = 1; Row <= 10; ++Row)
    {
        const float T  = static_cast<float>(Row) / 10.0f;
        const float Y  = HorizonY + (T * T) * (Max.y - HorizonY);
        const ImU32 C  = (Row == 4) ? AxisX : GridLine;
        DrawList->AddLine(ImVec2(Min.x, Y), ImVec2(Max.x, Y), C, Row == 4 ? 1.4f : 1.0f);
    }

}

#endif // FRONTIER_EDITOR && FRONTIER_WITH_INTERFACE_SDK

} // namespace Everest
