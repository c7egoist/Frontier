/*==========================================================================================================================================
                                                         EVERESTWORKSPACE.H
==========================================================================================================================================*/
// 🧩 Project Everest workspace: wraps EverestApplication runtime + #if FRONTIER_EDITOR docked authoring interface.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "EverestApplication.h"
#include "EverestSimulationRecords.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)
struct ImDrawList;
struct ImVec2;
#include "Engine/Interface/LogStreamPanel.h"
#include "Engine/Interface/PanelDockspace.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
#include "Engine/Interface/SceneInspectorPanel.h"
#include "UI/Editor/ControlCentrePanel.h"
#endif

#include <array>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <string>

namespace Everest
{

// 📝 What the Scene Viewport asks the host application to render and present each interface tick; the host owns the device
//    and the renderer, the workspace owns the camera (orbit, pan, dolly, fly) and the level records the host reads.
struct SceneViewportRequest
{
    float                 PanelWidth          = 0.0f;                 // [px] interface pixels
    float                 PanelHeight         = 0.0f;                 // [px]
    float                 PixelDensity        = 1.0f;                 // [-] framebuffer pixels per interface pixel
    std::array<double, 3> CameraPosition      = {0.0, 0.0, 0.0};      // [m] z-up world of the scene
    std::array<double, 3> CameraTarget        = {1.0, 0.0, 0.0};      // [m]
    double                VerticalFieldOfView = 1.0471975511965976;   // [rad]
    double                DeltaSeconds        = 0.0;                  // [s]
    bool                  DistanceSlice       = false;                // [-] the demo's distance-slice inset (I)
};

// 📝 What the host's renderer reports for the viewport bar, readout and status strip (the demo's PresentMeasurements).
struct SceneViewportReadout
{
    bool                    Presenting          = false;     // [-] an image is live
    std::string             Adapter{};                       // [-] GPU name
    std::string             Quality{};                       // [-] low / medium / high
    std::string             RendererTag{};                   // [-] "RTX ReSTIR PT (3B GI · 2B Refl · M=2)" or "GTX SDF GI"
    std::string             AccelerationLine{};              // [-] "BVH hierarchy   TLAS …" (RTX) or empty
    std::array<uint32_t, 2> ScreenExtent        = {0, 0};    // [px]
    std::array<uint32_t, 2> TraceExtent         = {0, 0};    // [px]
    double                  RefreshMilliseconds = 0.0;       // [ms] smoothed refresh duration
    std::string             Failure{};                       // [-] why there is no image, if it failed
};

struct SceneViewportImage
{
    uint64_t             Texture = 0;   // [-] ImTextureID of the presented image; 0 while unavailable
    std::string          Status{};      // [-] renderer, extent and refresh time, or the bring-up / failure line
    SceneViewportReadout Readout{};     // [-]
};

// 📝 The demo's overlay switches (OverlayDock.js): readout (H), distance slice (I) and the clean view (V), which hides both.
struct SceneViewportOverlays
{
    bool ReadoutVisible       = false;   // [-] HudVisible, off by default as in the demo
    bool DistanceSliceVisible = false;   // [-] InsetEnabled
    bool CleanView            = false;   // [-]
};

// 📝 Free camera of the viewport, navigated as Unreal Engine's perspective viewport (z up, metres): a position, the view's
//    heading and elevation, the flight velocity W/A/S/D/Q/E/R/F accelerate, Unreal's eight camera speed settings, the Z/C
//    field-of-view zoom that recoils once the right button is released, and the pivot that Alt orbits and dollies around.
//    The default is the former orbit view: focus (−10, 6, 3), 65.88 m away at yaw −142.43°, pitch 5.23°.
struct SceneViewportFlight
{
    std::array<double, 3> Position            = {-61.9997, -34.0018, 9.0052};   // [m] z-up world of the scene
    double                Heading             = 37.57;                          // [°] view direction, counter-clockwise from +X
    double                Elevation           = -5.23;                          // [°] view direction above the horizon
    double                PivotDistance       = 65.88;                          // [m] Alt orbit and dolly pivot ahead of the view
    double                VerticalFieldOfView = 1.0471975511965976;             // [rad] at rest
    double                FieldOfViewOffset   = 0.0;                            // [°] Z/C zoom while flying
    double                FieldOfViewRate     = 0.0;                            // [°/s]
    std::array<double, 3> Velocity            = {0.0, 0.0, 0.0};                // [m/s] flight velocity
    int                   SpeedSetting        = 4;                              // [1-8] Unreal camera speed setting
    double                WheelRemainder      = 0.0;                            // [-] partial wheel notches (touchpads)

    [[nodiscard]] std::array<double, 3> ResolveForward() const noexcept;
    [[nodiscard]] std::array<double, 3> ResolveLateral() const noexcept;
    [[nodiscard]] std::array<double, 3> ResolveTarget() const noexcept;
    [[nodiscard]] double                ResolveFieldOfView() const noexcept;
    // 📝 Unreal's GetCameraSpeed table for settings 1–8 (0.03125 … 32; 1 at the default setting 4).
    [[nodiscard]] static double         ResolveSpeed(int Setting) noexcept;
};

// 📝 One interface tick of pointer and keyboard input over the viewport, as the camera reads it (ImGui conventions: y down).
struct SceneViewportPointer
{
    bool                  Hovered       = false;        // [-] the pointer is over the viewport image
    bool                  Active        = false;        // [-] a drag that began on the viewport is still held
    bool                  LeftDown      = false;        // [-]
    bool                  RightDown     = false;        // [-]
    bool                  MiddleDown    = false;        // [-]
    bool                  AltDown       = false;        // [-]
    bool                  ShiftDown     = false;        // [-]
    std::array<double, 2> MotionPixels  = {0.0, 0.0};   // [px] pointer motion, +x right, +y down
    double                WheelNotches  = 0.0;          // [-] +away from the user
    std::array<bool, 10>  FlightKeys    = {};           // [-] forward, back, left, right, up, down, view up, view down, widen, narrow
    bool                  RecentrePress = false;        // [-] F pressed (without the right button)
};

// 📝 Advances the viewport camera by one tick of input: Unreal Engine's perspective viewport navigation.
void IntegrateSceneViewportFlight(SceneViewportFlight& Flight, const SceneViewportPointer& Pointer, double DeltaSeconds);

class EverestWorkspace
{
  public:
#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)
    explicit EverestWorkspace(Frontier::ControlCentrePanel& ControlCentre,
                              std::filesystem::path         ProjectRootPath = "Projects/Everest");
#else
    explicit EverestWorkspace(std::filesystem::path ProjectRootPath = "Projects/Everest");
#endif
    ~EverestWorkspace();

    EverestWorkspace(const EverestWorkspace&)            = delete;
    EverestWorkspace& operator=(const EverestWorkspace&) = delete;

    void IntegrateSimulation(double DeltaSeconds);

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)
    bool ConfigurePlatform() noexcept;
    void ConstructInterface(double DeltaSeconds);

    std::function<void()> EvaluateReturnToBrowser;
    // 📝 Set by the host application when it can render the scene; the viewport falls back to its schematic without it.
    std::function<SceneViewportImage(const SceneViewportRequest&)> PresentSceneViewport;
    // 📝 Set by the host application: hides the pointer and locks it to the platform window (an ImGuiViewport's
    //    PlatformHandle) while a camera drag lasts, so the view turns without the pointer meeting the screen edge; the
    //    pointer returns where the drag began. Without it the pointer stays visible and free.
    std::function<void(void* PlatformWindow, bool ConstraintEnabled)> ConstrainPointer;
    [[nodiscard]] SceneViewportFlight&      AccessViewportFlight() noexcept { return Flight; }
    [[nodiscard]] SceneViewportOverlays&    AccessViewportOverlays() noexcept { return Overlays; }

    [[nodiscard]] Frontier::SceneDirectoryPanel& QueryOutliner() noexcept { return OutlinerPanel; }
    [[nodiscard]] Frontier::SceneInspectorPanel& QueryInspector() noexcept { return InspectorPanel; }
    [[nodiscard]] Frontier::LogStreamPanel&      QueryLogStream() noexcept { return LogPanel; }
    [[nodiscard]] Frontier::PanelDockspace&      QueryDockspace() noexcept { return Dockspace; }
#endif

    [[nodiscard]] EverestApplication&          AccessApplication() noexcept { return Application; }
    [[nodiscard]] const EverestApplication&    QueryApplication() const noexcept { return Application; }
    [[nodiscard]] Frontier::SceneWorld&        QuerySceneWorld() noexcept { return Application.AccessWorld(); }
    [[nodiscard]] const Frontier::SceneWorld&  QuerySceneWorld() const noexcept { return Application.QueryWorld(); }
    [[nodiscard]] const std::filesystem::path& QueryProjectRoot() const noexcept { return ProjectRoot; }
    [[nodiscard]] const std::filesystem::path& QueryActiveLevelPath() const noexcept { return ActiveLevelPath; }
    [[nodiscard]] const std::string&           QueryDiagnostic() const noexcept { return Diagnostic; }
    [[nodiscard]] double                       QueryElapsedSeconds() const noexcept { return ElapsedSeconds; }

  private:
    void InitializeWorld();

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)
    void ServiceDynamicSceneRequests();
    void ConstructTopToolbar(float Scale);
    void ConstructViewportSurface();
    void ConstructViewportSchematic(ImDrawList* DrawList, const ImVec2& Min, const ImVec2& Max);
    void IntegrateViewportCamera(bool Hovered, bool Active, double DeltaSeconds);
    void ReleasePointerConstraint();
    void ConstructViewportBar(const ImVec2& Min, const ImVec2& Max, float Scale);
    void ConstructViewportOverlays(const ImVec2& StageMin, const ImVec2& StageMax, const SceneViewportImage& Image, float Scale);
    void ConstructStatusStrip(float Scale);
    void ToggleViewportOverlay(int Overlay);
    void AnnounceViewportNotice(std::string Text);

    Frontier::ControlCentrePanel& Centre;
    Frontier::PanelDockspace      Dockspace;
    Frontier::SceneDirectoryPanel OutlinerPanel;
    Frontier::SceneInspectorPanel InspectorPanel;
    Frontier::LogStreamPanel      LogPanel;
    uint64_t                      ObservedLayoutRevision = 0;
    SceneViewportFlight           Flight{};
    double                        ViewportDeltaSeconds   = 0.0;
    void*                         ConstrainedWindow      = nullptr;   // [-] platform window holding the pointer, or null
    int                           ConstraintSettleTicks  = 0;         // [-] ticks whose motion is dropped after a lock
    SceneViewportOverlays         Overlays{};
    SceneViewportReadout          LastReadout{};
    std::array<float, 240>        FrameDurations{};                   // [ms] the last 240 interface ticks (1 % low)
    size_t                        FrameDurationCursor    = 0;
    double                        FrameSeconds           = 0.0;       // [s] smoothed tick (0.9 / 0.1)
    std::string                   NoticeText{};                       // [-] #overlay-notice
    double                        NoticeSeconds          = 0.0;       // [s] left on screen
    int                           AnnouncedSpeedSetting  = 4;         // [-]
#endif

    std::filesystem::path ProjectRoot;
    std::filesystem::path ActiveLevelPath;
    EverestApplication    Application;
    std::string           Diagnostic;
    double                ElapsedSeconds = 0.0;
};

} // namespace Everest
