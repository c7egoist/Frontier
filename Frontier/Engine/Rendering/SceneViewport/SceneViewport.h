/*==========================================================================================================================================
                                                            SCENEVIEWPORT.H
==========================================================================================================================================*/
// 🧩 The live scene viewport: the ported VehicleHMI ReSTIR GI refresh of the proving ground (no vehicle), its own sky driven by the
//    level's environment records, and the PlanetaryAtmosphere environment overlaid on it, presented as one image.

#pragma once

#include "EnvironmentOverlay.h"

#include <array>
#include <filesystem>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace Frontier::GlobalIllumination
{

struct SceneViewportConfiguration
{
    std::filesystem::path GlobalIlluminationShaders{};   // [-] EngineContent/ShaderArchives/GlobalIllumination
    std::filesystem::path EnvironmentShaders{};          // [-] EngineContent/ShaderArchives/Environment; empty = the demo's own sky only
    std::filesystem::path SceneArchive{};                // [-] EnvironmentArchives/ProvingGround
    std::filesystem::path CelestialMaps{};               // [-] EnvironmentArchives/CelestialMaps
    std::string           Quality    = "medium";         // [-] the demo's grades: low | medium | high
    bool                  RayTracing = true;             // [-] RTX ReSTIR path tracer; false = GTX distance-field GI
    uint32_t              TraceScale = 2;                // [-] screen pixels per resampling pixel along one axis
    // 🔍 Bring-up steps and device faults, one line each (the editor's diagnostic journal); unset = silent.
    std::function<void(const std::string&)> Journal{};
};

// 📝 A camera in the illumination world (z up), as an orbit or fly controller resolves it.
struct ViewportCamera
{
    Vector3 Position{-47.0, 0.0, 3.15};
    Vector3 Target{-40.0, 0.0, 1.35};
    Vector3 Up{0.0, 0.0, 1.0};
    double  VerticalFieldOfView = 1.0471975511965976;   // [rad] 60°
    double  Near                = 0.05;                 // [m]
};

// 📝 Render-pipeline record values that change the refresh without rebuilding it.
struct ViewportRendering
{
    bool   GlobalIllumination   = true;
    bool   TemporalAntiAliasing = true;
    double ExposureCompensation = 0.0;   // [EV]
};

class SceneViewport
{
  public:
    SceneViewport();
    ~SceneViewport();

    SceneViewport(const SceneViewport&)            = delete;
    SceneViewport& operator=(const SceneViewport&) = delete;

    // 📝 HostDevice: the editor's presentation device (submissions then share its queue and thread); null opens a device of
    //    its own (offscreen validation). Brings up the proving ground with the vehicle deactivated.
    bool Construct(const VulkanDeviceAccess* HostDevice, const SceneViewportConfiguration& Configuration, std::array<uint32_t, 2> ScreenExtent,
                   std::string* OutDiagnostic = nullptr);

    // 📝 One refresh at ScreenExtent (the screen targets follow a changed extent). The presented image is complete when this
    //    returns; the last submission ends with a full dependency, so later submissions on the queue may sample it.
    bool Refresh(const ViewportCamera& Camera, const SceneEnvironment& Environment, const ViewportRendering& Rendering, double DeltaSeconds,
                 std::array<uint32_t, 2> ScreenExtent, std::string* OutDiagnostic = nullptr);

    // 📝 UNORM view of the sRGB-encoded presented image (VK_IMAGE_LAYOUT_GENERAL): display it without further conversion.
    [[nodiscard]] VkImageView QueryPresentedView() const noexcept;
    [[nodiscard]] std::array<uint32_t, 2> QueryScreenExtent() const noexcept;
    [[nodiscard]] bool QueryEnvironmentActive() const noexcept { return static_cast<bool>(Overlay_); }
    [[nodiscard]] const std::string& QueryAdapter() const noexcept { return Adapter_; }
    [[nodiscard]] const SceneViewportConfiguration& QueryConfiguration() const noexcept { return Configuration_; }
    bool ReadPresented(std::vector<uint8_t>& OutRgba);

    // 📝 The demo's ReconstructScreenTargets sizing: density × render scale, capped by the grade's pixel limit, at least 64 px.
    [[nodiscard]] static std::array<uint32_t, 2> ResolveScreenExtent(double PanelWidth, double PanelHeight, double PixelDensity, const std::string& Quality);

    // 📝 The demo's own environment the refresh encodes (its sky lights the scene; the overlaid environment is drawn over it).
    EnvironmentSettings Sky{};
    [[nodiscard]] IlluminationHost*   AccessHost() noexcept { return Host_.get(); }
    [[nodiscard]] EnvironmentOverlay* AccessOverlay() noexcept { return Overlay_.get(); }

  private:
    void ResolveSky(const SceneEnvironment& Environment);

    SceneViewportConfiguration             Configuration_{};
    std::unique_ptr<DeviceExchange>        Exchange_{};
    std::unique_ptr<VulkanComputeExchange> Environment_{};
    std::unique_ptr<IlluminationHost>      Host_{};
    std::unique_ptr<EnvironmentOverlay>    Overlay_{};
    std::shared_ptr<DeviceTextureView>     PresentedView_{};
    std::string                            Adapter_{};
    double                                 ElapsedSeconds_ = 0.0;
};

} // namespace Frontier::GlobalIllumination
