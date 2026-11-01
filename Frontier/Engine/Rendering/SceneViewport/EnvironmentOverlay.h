/*==========================================================================================================================================
                                                          ENVIRONMENTOVERLAY.H
==========================================================================================================================================*/
// 🧩 Draws the PlanetaryAtmosphere environment (atmosphere, sun, six-body moons, ringed planets, Hipparcos stars, 3D clouds, height
//    and froxel fog, lens flare) over the ported illumination refresh, on the same Vulkan device and queue.

#pragma once

#include "Frontier/Engine/Rendering/GlobalIllumination/IlluminationHost.h"

#include "Engine/Scene/EngineConfigurations.h"

#include <array>
#include <filesystem>
#include <memory>
#include <string>

// 📝 The PlanetaryAtmosphere types stay out of this header: its catalogue 'StarRecord' and the scene's 'StarRecord' record
//    alias both live in namespace Frontier, and editor code includes the scene.
namespace Frontier
{
class VulkanComputeExchange;
struct PlanetaryRealmEnsemble;
struct PlanetaryCameraView;
} // namespace Frontier

namespace Frontier::GlobalIllumination
{

// 📝 The environment records of an editor level (Engine/Scene/EngineConfigurations.h); a disabled record switches its effect off.
//    Directions follow the illumination world: z up, azimuth counter-clockwise from +X east (the demo's convention).
struct SceneEnvironment
{
    SolarConfiguration        Solar{};
    OpticalFlareConfiguration Flare{};
    AtmosphereConfiguration   Atmosphere{};
    CloudConfiguration        Clouds{};
    StarConfiguration         Stars{};
    MoonConfiguration         Moons{};
    FogConfiguration          Fog{};
    WindConfiguration         Wind{};
    double                    ElapsedSeconds = 0.0;   // [s] advects clouds, twinkles stars, turns the sky
};

// 📝 Unit direction of an elevation/azimuth pair in the illumination world (east, north, up).
[[nodiscard]] Vector3 ResolveSkyDirection(double ElevationDegrees, double AzimuthDegrees) noexcept;
// 📝 A moon's place on its sky path: the celestial equator of the observer, OrbitDegrees from the east horizon through the
//    culmination (90°) to the west horizon (180°); below the horizon from 180° to 360°.
[[nodiscard]] Vector3 ResolveMoonDirection(double OrbitDegrees, double LatitudeDegrees) noexcept;
// 📝 The illumination world rotated to the environment's y-up axes (x east, y up, z south); a proper rotation.
[[nodiscard]] std::array<float, 3> ProjectEnvironmentAxes(const Vector3& Vector) noexcept;

// 📝 Environment radiometric units per illumination unit in daylight: the environment's reference sun irradiance (luminance of
//    its default disc, 1.38) over the demo's SolarIlluminance (12). The resolved radiance enters the environment scaled and
//    the overlaid image is divided back before present, so sun-proportional terms keep the refresh's scale while the
//    environment's constant terms keep their designed balance.
inline constexpr double EnvironmentRadianceScale = 1.38 / 12.0;

// 📝 The scale of one refresh: the daylight unit divided by the share of daylight skylight left at the sun's elevation
//    (e^((elevation − 6°)/3°), between 0.002 and 1). The environment's constant ambient terms — cloud and fog skylight tuned
//    for day — so fade through twilight to night, where clouds and fog are lit by the moon, the stars and the lamps.
[[nodiscard]] double ResolveEnvironmentRadianceScale(const SceneEnvironment& Environment) noexcept;

class EnvironmentOverlay
{
  public:
    EnvironmentOverlay(DeviceExchange& Exchange, VulkanComputeExchange& Environment, ShaderInterchange& Shaders);
    ~EnvironmentOverlay();

    EnvironmentOverlay(const EnvironmentOverlay&)            = delete;
    EnvironmentOverlay& operator=(const EnvironmentOverlay&) = delete;

    // 📝 CelestialMaps holds MoonAlbedoSource2048.jpg, the five other 2K moon maps and Hipparcos8.csv.
    bool Construct(const std::filesystem::path& EnvironmentShaders, const std::filesystem::path& CelestialMaps, std::string* OutDiagnostic = nullptr);

    // 📝 Before IlluminationHost::AdvanceRefresh: matches the environment targets to the host's screen and returns the interlude that
    //    imports the resolved radiance, overlays the environment once the light of the refresh is known, and presents it.
    //    Latitude/Longitude place the observer for the stars (the sidereal angle follows the host's celestial solution).
    bool PrepareInterlude(IlluminationHost& Host, const SceneEnvironment& Environment, const CameraPose& Camera, double Latitude, double Longitude,
                          RefreshInterlude& OutInterlude, std::string* OutDiagnostic = nullptr);

    // 📝 The realm and camera of the last overlaid refresh (inspection, validation).
    [[nodiscard]] const PlanetaryRealmEnsemble& QueryEnsemble() const noexcept;
    [[nodiscard]] const PlanetaryCameraView&    QueryView() const noexcept;

  private:
    struct PlanetaryStore;
    bool ReconstructTargets(IlluminationHost& Host, uint32_t Width, uint32_t Height);
    void ResolveRealm(const IlluminationHost& Host, const SceneEnvironment& Environment, const CameraPose& Camera, double Latitude, double Longitude);

    DeviceExchange&                    Exchange_;
    VulkanComputeExchange&             Environment_;
    ShaderInterchange&                 Shaders_;
    std::unique_ptr<PlanetaryStore>    Planetary_{};   // [-] the PlanetaryAtmosphere sequence, realm and camera
    bool                               Constructed_ = false;
    std::shared_ptr<DescriptorLayout>  ImportLayout_{};
    std::shared_ptr<DeviceRegion>      ImportRegion_{};
    std::shared_ptr<DeviceProgram>     ImportProgram_{}, RestoreProgram_{};
    std::array<std::shared_ptr<DescriptorGroup>, 2> ImportGroups_{};
    std::shared_ptr<DeviceTexture>     VisibilityTexture_{}, RadianceTexture_{};
    std::shared_ptr<DeviceTextureView> RadianceView_{};
    std::array<uint32_t, 2>            TargetExtent_     = {0, 0};   // [px] environment targets the borrowed views describe
    uint32_t                           ScreenGeneration_ = ~0u;      // [-] host screen targets the import groups bind
    uint32_t                           RefreshIndex_     = 0;
    double                             RadianceScale_    = EnvironmentRadianceScale;
};

} // namespace Frontier::GlobalIllumination
