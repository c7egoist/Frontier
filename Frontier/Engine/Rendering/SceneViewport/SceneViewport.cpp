/*==========================================================================================================================================
                                                           SCENEVIEWPORT.CPP
==========================================================================================================================================*/
// 🧩 The live scene viewport: the ported VehicleHMI ReSTIR GI refresh of the proving ground (no vehicle), its own sky driven by the
//    level's environment records, and the PlanetaryAtmosphere environment overlaid on it, presented as one image.

#include "SceneViewport.h"

#include "Engine/DeviceExchange/VulkanComputeExchange.h"

#include <algorithm>
#include <cmath>
#include <fstream>

namespace Frontier::GlobalIllumination
{

namespace
{

constexpr double Pi = 3.141592653589793;

bool ReadArchive(const std::filesystem::path& Path, std::vector<uint8_t>& OutBytes, std::string* OutDiagnostic)
{
    std::ifstream Stream(Path, std::ios::binary);
    if (!Stream)
    {
        if (OutDiagnostic != nullptr) *OutDiagnostic = "scene archive missing: " + Path.string();
        return false;
    }
    OutBytes.assign(std::istreambuf_iterator<char>(Stream), std::istreambuf_iterator<char>());
    return true;
}

} // namespace

SceneViewport::SceneViewport() = default;

SceneViewport::~SceneViewport()
{
    // 📝 Device resources die before their exchanges; the borrowed environment views before the environment images.
    PresentedView_.reset();
    Overlay_.reset();
    Host_.reset();
    if (Environment_) Environment_->Shutdown();
    Environment_.reset();
    if (Exchange_) Exchange_->Shutdown();
}

std::array<uint32_t, 2> SceneViewport::ResolveScreenExtent(double PanelWidth, double PanelHeight, double PixelDensity, const std::string& Quality)
{
    const QualityGrade Grade = ResolveQualityGrade(Quality);
    double Ratio = std::min(PixelDensity > 0.0 ? PixelDensity : 1.0, 2.0) * Grade.RenderScale;
    const double Pixels = PanelWidth * PanelHeight * Ratio * Ratio;
    if (Pixels > Grade.PixelLimit) Ratio *= std::sqrt(Grade.PixelLimit / Pixels);
    return {static_cast<uint32_t>(std::max(64.0, std::floor(PanelWidth * Ratio))), static_cast<uint32_t>(std::max(64.0, std::floor(PanelHeight * Ratio)))};
}

bool SceneViewport::Construct(const VulkanDeviceAccess* HostDevice, const SceneViewportConfiguration& Configuration, std::array<uint32_t, 2> ScreenExtent,
                              std::string* OutDiagnostic)
{
    Configuration_ = Configuration;
    Exchange_      = std::make_unique<DeviceExchange>();
    if (HostDevice != nullptr ? !Exchange_->AttachDevice(*HostDevice, OutDiagnostic) : !Exchange_->Initialize("", OutDiagnostic)) return false;
    Adapter_ = Exchange_->AdapterDescription();
    if (Configuration.Journal)
    {
        Exchange_->FaultObserver = [Journal = Configuration.Journal](const std::string& Fault) { Journal("device fault: " + Fault); };
    }
    // 🔍 A device the editor already lost fails every submission; say so instead of blaming the first one made here.
    if (const VkResult Health = Exchange_->ProbeDevice(); Health != VK_SUCCESS)
    {
        if (OutDiagnostic != nullptr)
        {
            *OutDiagnostic = std::string("the Vulkan device was lost before the scene viewport submitted anything (vkQueueWaitIdle returned ") +
                             (Health == VK_ERROR_DEVICE_LOST ? "VK_ERROR_DEVICE_LOST" : std::to_string(static_cast<int>(Health))) + ")";
        }
        return false;
    }
    if (Configuration.Journal) Configuration.Journal("bring-up on " + Adapter_ + " (" + (HostDevice != nullptr ? "the editor's device" : "an own device") + ")");

    // ① the proving ground exactly as the demo built it, the vehicle deactivated (no car yet)
    IlluminationAssets Assets;
    Assets.FacetSpace  = Configuration.SceneArchive / "ProvingGround.facetspace";
    Assets.OmitVehicle = true;
    if (!ReadArchive(Configuration.SceneArchive / "Materials.bin", Assets.MaterialProfiles, OutDiagnostic)) return false;
    IlluminationSettings Settings;
    Settings.Quality    = Configuration.Quality;
    Settings.RayTracing = Configuration.RayTracing;
    Settings.TraceScale = std::max(1u, Configuration.TraceScale);
    Host_ = std::make_unique<IlluminationHost>(*Exchange_, Configuration.GlobalIlluminationShaders);
    Host_->Journal = Configuration.Journal;
    ScreenExtent = {std::max(64u, ScreenExtent[0]), std::max(64u, ScreenExtent[1])};
    if (!Host_->Construct(Assets, Settings, ScreenExtent, OutDiagnostic)) return false;

    // ② idle profiles of the parts the editor does not run yet (vehicle visual, effects, the demo's own clouds)
    const std::pair<const char*, std::shared_ptr<DeviceRegion>> Profiles[] = {{"VehicleProfile.bin", Host_->VehicleRegion},
                                                                             {"EffectProfile.bin", Host_->EffectRegion},
                                                                             {"CloudProfile.bin", Host_->CloudParams},
                                                                             {"CloudShadowProfile.bin", Host_->CloudShadowParams}};
    for (const auto& [Name, Region] : Profiles)
    {
        std::vector<uint8_t> Bytes;
        if (!ReadArchive(Configuration.SceneArchive / Name, Bytes, OutDiagnostic)) return false;
        Exchange_->WriteRegion(Region, 0, Bytes.data(), std::min<VkDeviceSize>(Bytes.size(), Region->Capacity));
    }

    // ③ the PlanetaryAtmosphere environment on the same device and queue (the viewport keeps the demo's own sky without it)
    if (!Configuration.EnvironmentShaders.empty())
    {
        Environment_ = std::make_unique<VulkanComputeExchange>();
        std::string EnvironmentDiagnostic;
        if (Environment_->AttachDevice(Exchange_->QueryDeviceAccess(), &EnvironmentDiagnostic))
        {
            Overlay_ = std::make_unique<EnvironmentOverlay>(*Exchange_, *Environment_, Host_->Shaders);
            if (!Overlay_->Construct(Configuration.EnvironmentShaders, Configuration.CelestialMaps, &EnvironmentDiagnostic)) Overlay_.reset();
        }
        if (!Overlay_)
        {
            if (OutDiagnostic != nullptr) *OutDiagnostic = "environment unavailable: " + EnvironmentDiagnostic;
            return false;
        }
        if (Configuration.Journal) Configuration.Journal("bring-up ⑧ PlanetaryAtmosphere environment on the same queue");
    }
    PresentedView_ = Exchange_->ConstructView(Host_->CaptureTexture);
    return PresentedView_ != nullptr;
}

void SceneViewport::ResolveSky(const SceneEnvironment& S)
{
    // ① the level's sun drives the demo's own light (exhibit scale: 98 klx ≙ the demo's SolarIlluminance 12)
    Sky.SunEnabled       = S.Solar.Enabled;
    Sky.SunAutoPosition  = false;
    Sky.DayAnimate       = false;
    Sky.SunElevation     = S.Solar.ElevationDegrees;
    Sky.SunAzimuth       = S.Solar.AzimuthDegrees;
    Sky.SolarIlluminance = 12.0 * std::max(0.0f, S.Solar.IlluminanceKilolux) / 98.0;
    Sky.SunTemperature   = std::clamp(static_cast<double>(S.Solar.KelvinTemperature), 1000.0, 40000.0);
    Sky.SunRadius        = 0.5 * std::max(0.05f, S.Solar.AngularDiameterDeg);

    // ② fog, aerial perspective and the flare come from the overlaid environment when it is present
    const bool Overlaid = static_cast<bool>(Overlay_);
    Sky.FlareEnabled  = false;
    Sky.FogEnabled    = !Overlaid && S.Fog.Enabled;
    Sky.FogDensity    = std::max(0.0f, S.Fog.BaseDensity);
    Sky.FogHeight     = 1.0 / std::max(1.0e-3f, S.Fog.HeightFalloff);
    Sky.AerialEnabled = !Overlaid && S.Atmosphere.Enabled && S.Atmosphere.AerialPerspective;

    // ③ the primary moon on the same sky path the environment draws it on; its phase follows the sun–moon geometry
    const Vector3 Moon = ResolveMoonDirection(S.Moons.PrimaryOrbitDegrees, Sky.Latitude);
    const Vector3 Sun  = ResolveSkyDirection(Sky.SunElevation, Sky.SunAzimuth);
    Sky.PrimaryMoon.MoonEnabled   = S.Moons.Enabled;
    Sky.PrimaryMoon.MoonAzimuth   = std::atan2(Moon[1], Moon[0]) * 180.0 / Pi;
    Sky.PrimaryMoon.MoonElevation = std::asin(std::clamp(Moon[2], -1.0, 1.0)) * 180.0 / Pi;
    Sky.PrimaryMoon.MoonPhase     = std::acos(std::clamp(DotVector(Sun, Moon), -1.0, 1.0)) / Pi * 14.765;

    // ④ stars and planets, atmosphere scales
    Sky.StarsEnabled      = S.Stars.Enabled;
    Sky.PlanetsEnabled    = S.Stars.Enabled;
    Sky.AtmosphereEnabled = S.Atmosphere.Enabled;
    Sky.Atmosphere.Rayleigh = std::max(0.0f, S.Atmosphere.RayleighScattering);
    Sky.Atmosphere.Mie      = std::max(0.0, (static_cast<double>(S.Atmosphere.MieTurbidity) - 1.0) / 1.4);
    Sky.Atmosphere.Ozone    = std::max(0.0f, S.Atmosphere.OzoneAbsorptionScale);
    Sky.Atmosphere.MieG     = std::clamp(static_cast<double>(S.Atmosphere.MieAnisotropyG), -0.95, 0.95);
}

bool SceneViewport::Refresh(const ViewportCamera& Camera, const SceneEnvironment& Environment, const ViewportRendering& Rendering, double DeltaSeconds,
                            std::array<uint32_t, 2> ScreenExtent, std::string* OutDiagnostic)
{
    if (!Host_) return false;
    ScreenExtent = {std::max(64u, ScreenExtent[0]), std::max(64u, ScreenExtent[1])};
    if (ScreenExtent != Host_->ScreenExtent)
    {
        // 📝 A borrowing owner may still sample the old presented image in flight: retire everything before replacing it.
        Exchange_->AwaitIdle();
        Host_->ReconstructScreenTargets(ScreenExtent);
        PresentedView_ = Exchange_->ConstructView(Host_->CaptureTexture);
    }
    ElapsedSeconds_ += std::max(0.0, DeltaSeconds);
    ResolveSky(Environment);

    RefreshInputs Inputs;
    Inputs.Camera.Position            = Camera.Position;
    Inputs.Camera.Target              = Camera.Target;
    Inputs.Camera.Forward             = NormalizeVector(SubtractVector(Camera.Target, Camera.Position));
    Inputs.Camera.Up                  = Camera.Up;
    Inputs.Camera.VerticalFieldOfView = Camera.VerticalFieldOfView;
    Inputs.Camera.Aspect              = static_cast<double>(ScreenExtent[0]) / static_cast<double>(ScreenExtent[1]);
    Inputs.Camera.Near                = Camera.Near;
    // 📝 IlluminationHost.js: the cascades centre 0.45 of a cascade-0 span ahead of the camera.
    Inputs.Focus = MultiplyAddVector(Camera.Position, Inputs.Camera.Forward, 0.45 * Host_->Grade.ClipResolution * Host_->Grade.FinestVoxel);
    Inputs.Toggles.Indirect             = Rendering.GlobalIllumination;
    Inputs.Toggles.Antialias            = Rendering.TemporalAntiAliasing;
    Inputs.Toggles.ExposureCompensation = Rendering.ExposureCompensation;
    Inputs.Toggles.RayTracing           = Configuration_.RayTracing;
    Host_->Settings.Indirect            = Rendering.GlobalIllumination;
    // 📝 Idle inputs of the parts outside the port, as the demo writes them with no cabin and nothing burning.
    Inputs.External.ElapsedSeconds = ElapsedSeconds_;
    Inputs.External.HmiWord        = (1u << 8) | (1000u << 20);
    Inputs.External.FireBlock      = {0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.46f, 0.14f, 14.0f};
    Inputs.Environment             = &Sky;
    Inputs.CelestialDelta          = std::max(0.0, DeltaSeconds);
    Inputs.LuminairesLive          = true;

    RefreshInterlude Interlude;
    if (Overlay_ && !Overlay_->PrepareInterlude(*Host_, Environment, Inputs.Camera, Sky.Latitude, Sky.Longitude, Interlude, OutDiagnostic)) return false;
    return Host_->AdvanceRefresh(&Inputs, nullptr, nullptr, OutDiagnostic, &Interlude);
}

VkImageView SceneViewport::QueryPresentedView() const noexcept
{
    return PresentedView_ ? PresentedView_->Handle : VK_NULL_HANDLE;
}

std::array<uint32_t, 2> SceneViewport::QueryScreenExtent() const noexcept
{
    return Host_ ? Host_->ScreenExtent : std::array<uint32_t, 2>{0, 0};
}

bool SceneViewport::ReadPresented(std::vector<uint8_t>& OutRgba)
{
    return Host_ && Exchange_->ReadTexture(Host_->CaptureTexture, 0, 0, OutRgba);
}

} // namespace Frontier::GlobalIllumination
