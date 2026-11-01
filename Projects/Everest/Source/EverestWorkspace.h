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
};

struct SceneViewportImage
{
    uint64_t    Texture = 0;   // [-] ImTextureID of the presented image; 0 while unavailable
    std::string Status{};      // [-] one line drawn over the viewport (renderer, extent, bring-up or failure)
};

// 📝 Orbit camera of the viewport: yaw/pitch/distance around a focus point, z up.
struct SceneViewportOrbit
{
    std::array<double, 3> Focus               = {-10.0, 6.0, 3.0};    // [m]
    double                Yaw                 = -142.43;              // [°] of the camera offset, counter-clockwise from +X
    double                Pitch               = 5.23;                 // [°]
    double                Distance            = 65.88;                // [m]
    double                VerticalFieldOfView = 1.0471975511965976;   // [rad]

    [[nodiscard]] std::array<double, 3> ResolvePosition() const noexcept;
};

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
    [[nodiscard]] SceneViewportOrbit&       AccessViewportOrbit() noexcept { return Orbit; }

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

    Frontier::ControlCentrePanel& Centre;
    Frontier::PanelDockspace      Dockspace;
    Frontier::SceneDirectoryPanel OutlinerPanel;
    Frontier::SceneInspectorPanel InspectorPanel;
    Frontier::LogStreamPanel      LogPanel;
    uint64_t                      ObservedLayoutRevision = 0;
    SceneViewportOrbit            Orbit{};
    double                        ViewportDeltaSeconds   = 0.0;
#endif

    std::filesystem::path ProjectRoot;
    std::filesystem::path ActiveLevelPath;
    EverestApplication    Application;
    std::string           Diagnostic;
    double                ElapsedSeconds = 0.0;
};

} // namespace Everest
