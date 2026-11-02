/*==========================================================================================================================================
                                                         ENVIRONMENTOVERLAY.CPP
==========================================================================================================================================*/
// 🧩 Draws the PlanetaryAtmosphere environment (atmosphere, sun, six-body moons, ringed planets, Hipparcos stars, 3D clouds, height
//    and froxel fog, lens flare) over the ported illumination refresh, on the same Vulkan device and queue.

#include "EnvironmentOverlay.h"

#include "Engine/PlanetaryAtmosphere/PlanetaryEnsemble.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace Frontier::GlobalIllumination
{

namespace
{

constexpr double Pi              = 3.141592653589793;
constexpr double DegreesToRadian = Pi / 180.0;
// 📝 Local sidereal angle the Hipparcos catalogue is baked for (DecodeHipparcosCatalogue defaults: J2000.0 at 0°, 0°).
constexpr double CatalogueSidereal = 280.46061837 * DegreesToRadian;
constexpr double SiderealRate      = 2.0 * Pi / 86164.0905;   // [rad/s]

using D = DescriptorCode;

uint64_t HashBytes(uint64_t Hash, const void* Bytes, size_t Count) noexcept
{
    const auto* Cursor = static_cast<const uint8_t*>(Bytes);
    for (size_t Index = 0; Index < Count; ++Index) Hash = (Hash ^ Cursor[Index]) * 1099511628211ull;
    return Hash;
}

template <typename Number> uint64_t HashScalar(uint64_t Hash, const Number& Scalar) noexcept
{
    return HashBytes(Hash, &Scalar, sizeof(Scalar));
}

Vec3 ToVec3(const std::array<float, 3>& Vector) noexcept
{
    return {Vector[0], Vector[1], Vector[2]};
}

SpatialVector ToSpatial(const std::array<float, 3>& Vector) noexcept
{
    return {Vector[0], Vector[1], Vector[2]};
}

// 📝 Rodrigues rotation of a direction about a unit axis.
Vector3 RotateAbout(const Vector3& Direction, const Vector3& Axis, double Angle) noexcept
{
    const double  Cosine = std::cos(Angle), Sine = std::sin(Angle);
    const Vector3 Cross  = CrossVector(Axis, Direction);
    const double  Along  = DotVector(Axis, Direction);
    return {Direction[0] * Cosine + Cross[0] * Sine + Axis[0] * Along * (1.0 - Cosine),
            Direction[1] * Cosine + Cross[1] * Sine + Axis[1] * Along * (1.0 - Cosine),
            Direction[2] * Cosine + Cross[2] * Sine + Axis[2] * Along * (1.0 - Cosine)};
}

// 📝 The level's atmosphere record on the environment's medium: its scattering scales on the Earth reference (turbidity 2.4 ≙
//    the reference aerosol load). The realm's sky and the sun's and moons' transmittance all come from it.
AtmosphereParameters ResolveAtmosphereParameters(const SceneEnvironment& S)
{
    AtmosphereParameters Air = MakeEarthAtmosphere();
    if (S.Atmosphere.Enabled)
    {
        const double Rayleigh = std::max(0.0, static_cast<double>(S.Atmosphere.RayleighScattering));
        Air.RayleighScattering = {Air.RayleighScattering.R * Rayleigh, Air.RayleighScattering.G * Rayleigh, Air.RayleighScattering.B * Rayleigh};
        const double Aerosol = std::max(0.0, (static_cast<double>(S.Atmosphere.MieTurbidity) - 1.0) / 1.4);
        Air.MieScattering *= Aerosol;
        Air.MieAbsorption *= Aerosol;
        Air.MiePhaseG = std::clamp(static_cast<double>(S.Atmosphere.MieAnisotropyG), -0.95, 0.95);
        const double Ozone = std::max(0.0, static_cast<double>(S.Atmosphere.OzoneAbsorptionScale));
        Air.OzoneAbsorption = {Air.OzoneAbsorption.R * Ozone, Air.OzoneAbsorption.G * Ozone, Air.OzoneAbsorption.B * Ozone};
        Air.GroundRadiusKm = std::max(100.0, static_cast<double>(S.Atmosphere.PlanetRadiusKm));
        Air.TopRadiusKm    = Air.GroundRadiusKm + std::max(1.0, static_cast<double>(S.Atmosphere.AtmosphereThicknessKm));
    }
    else
    {
        Air.RayleighScattering = {0.0, 0.0, 0.0};
        Air.MieScattering      = 0.0;
        Air.MieAbsorption      = 0.0;
        Air.OzoneAbsorption    = {0.0, 0.0, 0.0};
    }
    return Air;
}

constexpr float ObserverAltitudeKm = 0.05f;   // [km] the realm's observer above the ground

// 📝 Transmittance of the environment's air from the observer toward a direction of the illumination world (z up).
Vector3 ResolveAirTransmittance(const AtmosphereParameters& Air, const Vector3& Direction)
{
    const SpectrumRgb T = TransmittanceToTop(Air, Air.GroundRadiusKm + ObserverAltitudeKm, std::clamp(Direction[2], -1.0, 1.0), 48);
    return {T.R, T.G, T.B};
}

// 📝 Planet records in the demo solver's order (Venus, Jupiter, Mars, Saturn): surface archetype and procedural seed.
constexpr std::array<PlanetarySurfaceArchetype, 4> PlanetArchetypes = {PlanetarySurfaceArchetype::OceanicTerrestrial,
                                                                       PlanetarySurfaceArchetype::BandedGasGiant,
                                                                       PlanetarySurfaceArchetype::RustyDesertWorld,
                                                                       PlanetarySurfaceArchetype::BandedGasGiant};

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                   SKY PLACEMENT
//------------------------------------------------------------------------------------------------------------------------

Vector3 ResolveSkyDirection(double ElevationDegrees, double AzimuthDegrees) noexcept
{
    const double Elevation = ElevationDegrees * DegreesToRadian, Azimuth = AzimuthDegrees * DegreesToRadian;
    return {std::cos(Elevation) * std::cos(Azimuth), std::cos(Elevation) * std::sin(Azimuth), std::sin(Elevation)};
}

Vector3 ResolveMoonDirection(double OrbitDegrees, double LatitudeDegrees) noexcept
{
    // 📝 Declination 0, hour angle = orbit − 90°: east horizon, culmination towards the equator, west horizon.
    const double θ = OrbitDegrees * DegreesToRadian, φ = LatitudeDegrees * DegreesToRadian;
    return {std::cos(θ), -std::sin(θ) * std::sin(φ), std::sin(θ) * std::cos(φ)};
}

std::array<float, 3> ProjectEnvironmentAxes(const Vector3& Vector) noexcept
{
    return {static_cast<float>(Vector[0]), static_cast<float>(Vector[2]), static_cast<float>(-Vector[1])};
}

double ResolveEnvironmentRadianceScale(const SceneEnvironment& Environment) noexcept
{
    const double Elevation = Environment.Solar.Enabled ? static_cast<double>(Environment.Solar.ElevationDegrees) : -90.0;
    const double Skylight  = std::clamp(std::exp((Elevation - 6.0) / 3.0), 0.002, 1.0);
    return EnvironmentRadianceScale / Skylight;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   OVERLAY
//------------------------------------------------------------------------------------------------------------------------

struct EnvironmentOverlay::PlanetaryStore
{
    PlanetarySubmissionSequence Sequence{};
    PlanetaryRealmEnsemble      Ensemble{};
    PlanetaryCameraView         View{};
    DeviceMemorySpan            SceneShadowFrame{};   // [-] the refresh's sun cascades for the fog (FogSceneShadow::Frame)
    DeviceImageArraySlot        SceneShadowDepth{};   // [-] the refresh's cascade depth array, borrowed
    FogSceneShadow              SceneShadow{};
};

EnvironmentOverlay::EnvironmentOverlay(DeviceExchange& Exchange, VulkanComputeExchange& Environment, ShaderInterchange& Shaders)
    : Exchange_(Exchange), Environment_(Environment), Shaders_(Shaders), Planetary_(std::make_unique<PlanetaryStore>())
{
}

const PlanetaryRealmEnsemble& EnvironmentOverlay::QueryEnsemble() const noexcept
{
    return Planetary_->Ensemble;
}

const PlanetaryCameraView& EnvironmentOverlay::QueryView() const noexcept
{
    return Planetary_->View;
}

bool EnvironmentOverlay::ReadOverlaidRadiance(std::vector<float>& OutLinearRgba)
{
    return Constructed_ && Planetary_->Sequence.ReadbackHdrFrame(Environment_, OutLinearRgba);
}

EnvironmentOverlay::~EnvironmentOverlay()
{
    // 📝 The borrowed views go first; the images belong to the environment exchange.
    ImportGroup_.reset();
    RadianceView_.reset();
    VisibilityTexture_.reset();
    RadianceTexture_.reset();
    LightingGroup_.reset();
    BorrowedSky_.reset();
    BorrowedCloudShadow_.reset();
    if (Constructed_)
    {
        Planetary_->Sequence.ConfigureFogSceneShadow(nullptr);
        Environment_.ReleaseMemorySpan(Planetary_->SceneShadowFrame);
        Planetary_->Sequence.Shutdown(Environment_);
    }
}

bool EnvironmentOverlay::Construct(const std::filesystem::path& EnvironmentShaders, const std::filesystem::path& CelestialMaps, std::string* OutDiagnostic)
{
    const std::filesystem::path Luna      = CelestialMaps / "MoonAlbedoSource2048.jpg";
    const std::filesystem::path Hipparcos = CelestialMaps / "Hipparcos8.csv";
    if (!Planetary_->Sequence.Initialize(Environment_, EnvironmentShaders.string(), Luna.string(), Hipparcos.string(), OutDiagnostic))
    {
        if (OutDiagnostic != nullptr && OutDiagnostic->empty()) *OutDiagnostic = "PlanetaryAtmosphere initialization failed";
        return false;
    }
    Constructed_ = true;
    const std::vector<DescriptorSlot> Slots = {{D::Uniform}, {D::Texture2D}, {D::TextureDepth2D},
                                               {D::StorageTexture2D, TextureFormat::Rgba16Float}, {D::StorageTexture2D, TextureFormat::Rgba16Float},
                                               {D::StorageTexture2D, TextureFormat::Rgba16Float}, {D::StorageTexture2D, TextureFormat::Rgba16Float},
                                               {D::Uniform}, {D::StorageTexture2D, TextureFormat::Rgba16Float}};
    ImportLayout_  = Exchange_.ConstructDescriptorLayout(Slots, "Environment visibility");
    ImportRegion_  = Exchange_.ConstructRegion(16, "Environment import profile");
    ImportProgram_  = Shaders_.ConstructComputeProgram("EnvironmentVisibility", "ProjectEnvironmentVisibility", {ImportLayout_});
    RestoreProgram_ = Shaders_.ConstructComputeProgram("EnvironmentVisibility", "RestoreEnvironmentRadiance", {ImportLayout_});
    if (!ImportProgram_ || !RestoreProgram_)
    {
        if (OutDiagnostic != nullptr) *OutDiagnostic = "environment visibility program: " + Shaders_.LastDiagnostic();
        return false;
    }
    // 📝 The environment-lighting bridge: profile, the environment's sky view and cloud shadow map, the refresh's two targets.
    const std::vector<DescriptorSlot> LightingSlots = {{D::Uniform}, {D::Texture2DLayered}, {D::Texture2DLayered}, {D::Sampler},
                                                       {D::StorageTexture2D, TextureFormat::Rgba16Float},
                                                       {D::StorageTexture2D, TextureFormat::Rgba16Float}};
    LightingLayout_     = Exchange_.ConstructDescriptorLayout(LightingSlots, "Environment lighting");
    LightingRegion_     = Exchange_.ConstructRegion(48, "Environment lighting profile");
    SkyProgram_         = Shaders_.ConstructComputeProgram("EnvironmentLighting", "ProjectEnvironmentSky", {LightingLayout_});
    CloudShadowProgram_ = Shaders_.ConstructComputeProgram("EnvironmentLighting", "ProjectCloudShadow", {LightingLayout_});
    SamplerSpecification Linear;
    Linear.MagFilter = Linear.MinFilter = FilterMode::Linear;
    LightingSampler_ = Exchange_.ConstructSampler(Linear);
    if (!LightingLayout_ || !LightingRegion_ || !SkyProgram_ || !CloudShadowProgram_ || !LightingSampler_)
    {
        if (OutDiagnostic != nullptr) *OutDiagnostic = "environment lighting program: " + Shaders_.LastDiagnostic();
        return false;
    }
    return true;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   ENVIRONMENT LIGHTING
//------------------------------------------------------------------------------------------------------------------------

void EnvironmentOverlay::AdjustLight(const IlluminationHost& Host, const SceneEnvironment& S, double Latitude, LightSolution& Light)
{
    const AtmosphereParameters Air  = ResolveAtmosphereParameters(S);
    const Vector3&             Tint = Host.Atmosphere->SolarTint;   // the level's colour temperature, as the demo derives it
    const double               E    = Host.Settings.SolarIlluminance;

    // ① the sun through the environment's air, replacing the demo's own 64-step air mass (same sun, same fade)
    const Vector3 Sun = ResolveAirTransmittance(Air, Light.SunDirection);
    for (int Channel = 0; Channel < 3; ++Channel) Light.SolarIlluminance[Channel] = Sun[Channel] * Tint[Channel] * E * Light.SunVisible;
    if (Light.Source == "Sun") Light.Illuminance = Light.SolarIlluminance;

    // ② night (the demo's moon key light below −4°): Luna at the Moons record's phase and albedo, Ember lit by its elongation from
    //    the sun; the brighter body casts the shadows, both add their light
    if (Light.Source == "Moon")
    {
        const double Fade = !S.Solar.Enabled ? 1.0 : std::clamp((-static_cast<double>(S.Solar.ElevationDegrees) - 4.0) / 6.0, 0.0, 1.0);
        auto Moonlight = [&](const Vector3& Direction, double Lit, double Gain, const Vector3& Colour) {
            const double  Elevation = std::asin(std::clamp(Direction[2], -1.0, 1.0)) / DegreesToRadian;
            const double  Horizon   = std::clamp((Elevation + 0.5) / 2.0, 0.0, 1.0);
            const Vector3 Through   = ResolveAirTransmittance(Air, Direction);
            Vector3       Arrival{};
            for (int Channel = 0; Channel < 3; ++Channel) Arrival[Channel] = Colour[Channel] * Through[Channel] * Horizon * Fade * Lit * Gain;
            return Arrival;
        };
        // 📝 Luna: the demo's full-moon light (0.08, 0.10, 0.14); phase 0 new · 0.5 full · 1 new, albedo against the reference 0.12.
        const Vector3 LunaDirection  = ResolveMoonDirection(S.Moons.PrimaryOrbitDegrees, Latitude);
        const double  LunaLit        = 0.5 - 0.5 * std::cos(2.0 * Pi * static_cast<double>(S.Moons.PrimaryPhase));
        const Vector3 Luna           = Moonlight(LunaDirection, LunaLit, S.Moons.Enabled ? std::max(0.0, S.Moons.PrimaryAlbedo / 0.12) : 0.0,
                                                 {0.08, 0.10, 0.14});
        // 📝 Ember: disc ≈ 0.35 of Luna's at surface brightness 1.4 against 1.6, warmer; lit fraction (1 − cos elongation) / 2.
        const Vector3 EmberDirection = ResolveMoonDirection(S.Moons.SecondaryOrbitDegrees, Latitude);
        const double  EmberLit       = 0.5 - 0.5 * DotVector(Light.SunDirection, EmberDirection);
        const Vector3 Ember          = Moonlight(EmberDirection, EmberLit, (S.Moons.Enabled && S.Moons.SecondaryMoonEnabled) ? 0.30 : 0.0,
                                                 {0.10, 0.075, 0.05});
        const double LunaSum  = Luna[0] + Luna[1] + Luna[2];
        const double EmberSum = Ember[0] + Ember[1] + Ember[2];
        if (LunaSum + EmberSum > 0.0) Light.Direction = LunaSum >= EmberSum ? LunaDirection : EmberDirection;
        for (int Channel = 0; Channel < 3; ++Channel) Light.Illuminance[Channel] = Luna[Channel] + Ember[Channel];
    }
    AdjustedLight_ = Light;
}

bool EnvironmentOverlay::ReconstructLighting(IlluminationHost& Host, const SceneEnvironment& S)
{
    const DeviceImageArraySlot& Sky    = Planetary_->Sequence.AtmosphereLuts().SkyViewArray();
    const DeviceImageArraySlot& Shadow = Planetary_->Sequence.Clouds().CloudShadowArray();
    if (Sky.Image == VK_NULL_HANDLE || Shadow.Image == VK_NULL_HANDLE || Planetary_->Ensemble.Realms.empty()) return false;

    // ① borrow the environment's sky view and cloud shadow map (rebuilt only when the environment replaced an image)
    if (!LightingGroup_ || BorrowedImages_[0] != Sky.Image || BorrowedImages_[1] != Shadow.Image)
    {
        LightingGroup_.reset();
        BorrowedSky_.reset();
        BorrowedCloudShadow_.reset();
        auto Borrow = [this](const DeviceImageArraySlot& Slot, const char* Label) {
            TextureSpecification Specification;
            Specification.Label         = Label;
            Specification.Width         = Slot.Width;
            Specification.Height        = Slot.Height;
            Specification.DepthOrLayers = std::max(1u, Slot.ArrayLayers);
            Specification.Format        = TextureFormat::Rgba16Float;
            Specification.Usage         = TextureUsage::Storage | TextureUsage::Sampled;
            return Exchange_.WrapTexture(Slot.Image, Specification);
        };
        BorrowedSky_         = Borrow(Sky, "Environment sky view (borrowed)");
        BorrowedCloudShadow_ = Borrow(Shadow, "Environment cloud shadow map (borrowed)");
        if (!BorrowedSky_ || !BorrowedCloudShadow_) return false;
        TextureViewSpecification Layered;
        Layered.Dimension    = ViewDimension::PlanarLayered;
        Layered.DimensionSet = true;
        LightingGroup_ = Exchange_.ConstructDescriptorGroup(
            LightingLayout_, {LightingRegion_, Exchange_.ConstructView(BorrowedSky_, Layered), Exchange_.ConstructView(BorrowedCloudShadow_, Layered),
                              LightingSampler_, Host.Atmosphere->SkyView, Exchange_.ConstructView(Host.CloudShadowTexture)},
            "Environment lighting");
        if (!LightingGroup_) return false;
        BorrowedImages_ = {Sky.Image, Shadow.Image};
    }

    // ② the bridge profile: the environment's primary sun and planet, its scale, the cloud shadow square
    const PlanetaryRealm& R      = Planetary_->Ensemble.Realms[0];
    const bool            Sunlit = !R.Suns.empty();
    const std::array<float, 3> SunDirection = Sunlit ? R.Suns[0].DirectionUnit : std::array<float, 3>{0.0f, 1.0f, 0.0f};
    const bool  Shadowing = Sunlit && S.Clouds.Enabled && S.Clouds.CastGroundShadows && !R.CloudVolumes.empty();
    const float Profile[12] = {SunDirection[0], SunDirection[1], SunDirection[2], static_cast<float>(1.0 / std::max(RadianceScale_, 1.0e-9)),
                               static_cast<float>(R.Atmosphere.GroundRadiusKm), static_cast<float>(R.Atmosphere.GroundRadiusKm + R.ObserverAltitudeKm),
                               0.0f, 1.0f,
                               R.CloudShadowHalfSpanM, 0.0f, Shadowing ? 1.0f : 0.0f, 0.0f};
    Exchange_.WriteRegion(LightingRegion_, 0, Profile, sizeof(Profile));

    // ③ the demo's projected cloud shadow parameters (CloudShadowLayouts.slang) over that square, along this refresh's sun
    const float    Half     = R.CloudShadowHalfSpanM;
    const Vector3& Sun      = Host.LastLight.SunDirection;
    const float    Base     = Shadowing ? static_cast<float>(R.CloudVolumes[0].Slab.LowerHeightM) : 0.0f;
    const float    Top      = Shadowing ? static_cast<float>(R.CloudVolumes[0].Slab.TopHeightM) : 0.0f;
    const float    Shadows[12] = {-Half, -Half, 2.0f * Half, Shadowing ? 1.0f : 0.0f,
                                  static_cast<float>(Sun[0]), static_cast<float>(Sun[1]), static_cast<float>(Sun[2]), 1.0f,
                                  12.0f, 4.0f, Base, Top};
    Exchange_.WriteRegion(Host.CloudShadowParams, 0, Shadows, sizeof(Shadows));
    return true;
}

void EnvironmentOverlay::ConfigureFogShadow(const IlluminationHost& Host, const SceneEnvironment& S)
{
    // 📝 Sun shafts through the scene: the fog samples the refresh's own sun cascades (rendered by now) when the sun is the key
    //    light; at night the cascades follow the moon, and the environment's sun lies below the horizon anyway.
    PlanetaryStore& P      = *Planetary_;
    const bool      Shafts = S.Solar.Enabled && S.Solar.VolumetricLightShaft && S.Fog.Enabled && S.Fog.ReceiveRayShadow && Host.Shadow &&
                        Host.Shadow->DepthTexture && Host.Shadow->LayeredView && Host.Shadow->LastReceiverBytes.size() >= 56 * sizeof(float) &&
                        Host.LastLight.Source == "Sun";
    if (!Shafts)
    {
        P.Sequence.ConfigureFogSceneShadow(nullptr);
        return;
    }
    std::array<float, kFogSceneShadowFloat4Count * 4> Frame{};
    std::memcpy(Frame.data(), Host.Shadow->LastReceiverBytes.data(), 56 * sizeof(float));
    Frame[56] = 1.0f;      // enabled
    Frame[57] = 0.0015f;   // depth bias (light clip depth)
    if (!Environment_.UploadMemorySpan(P.SceneShadowFrame, Frame.data(), sizeof(Frame)))
    {
        P.Sequence.ConfigureFogSceneShadow(nullptr);
        return;
    }
    const TextureSpecification& Depth = Host.Shadow->DepthTexture->Specification;
    P.SceneShadowDepth = {Host.Shadow->DepthTexture->Image, VK_NULL_HANDLE, Host.Shadow->LayeredView->Handle, VK_FORMAT_D32_SFLOAT,
                          Depth.Width, Depth.Height, Depth.DepthOrLayers, VK_IMAGE_LAYOUT_GENERAL};
    P.SceneShadow = {&P.SceneShadowFrame, &P.SceneShadowDepth};
    P.Sequence.ConfigureFogSceneShadow(&P.SceneShadow);
}

bool EnvironmentOverlay::ReconstructTargets(IlluminationHost& Host, uint32_t Width, uint32_t Height)
{
    // 📝 Identity by extent and generation, not by handle: a released handle value may come back for the next image.
    const std::array<uint32_t, 2> Extent = {Width, Height};
    if (Extent == TargetExtent_ && Host.ScreenGeneration == ScreenGeneration_ && ImportGroup_) return true;
    // 📝 The borrowed views go before the environment replaces the images they describe.
    ImportGroup_.reset();
    RadianceView_.reset();
    VisibilityTexture_.reset();
    RadianceTexture_.reset();
    if (!Planetary_->Sequence.EnsureViewportTargets(Environment_, Width, Height)) return false;
    const DeviceImageArraySlot& Visibility = Planetary_->Sequence.Visibility().VisibilityArray();
    const DeviceImageArraySlot& Radiance   = Planetary_->Sequence.HdrTarget();

    // 📝 Borrow the environment's images: VisibilityArray (4 layers) is written per layer, HdrTarget is what present tone-maps.
    TextureSpecification Layers;
    Layers.Label         = "Environment visibility (borrowed)";
    Layers.Width         = Visibility.Width;
    Layers.Height        = Visibility.Height;
    Layers.DepthOrLayers = Visibility.ArrayLayers;
    Layers.Format        = TextureFormat::Rgba16Float;
    Layers.Usage         = TextureUsage::Storage | TextureUsage::Sampled;
    VisibilityTexture_   = Exchange_.WrapTexture(Visibility.Image, Layers);
    TextureSpecification Overlaid = Layers;
    Overlaid.Label         = "Environment radiance (borrowed)";
    Overlaid.DepthOrLayers = 1;
    RadianceTexture_       = Exchange_.WrapTexture(Radiance.Image, Overlaid);
    if (!VisibilityTexture_ || !RadianceTexture_) return false;
    std::array<std::shared_ptr<DeviceTextureView>, 4> LayerViews;
    for (uint32_t Layer = 0; Layer < 4; ++Layer)
    {
        TextureViewSpecification Slice;
        Slice.Dimension    = ViewDimension::Planar;
        Slice.DimensionSet = true;
        Slice.BaseLayer    = Layer;
        Slice.LayerCount   = 1;
        LayerViews[Layer]  = Exchange_.ConstructView(VisibilityTexture_, Slice);
    }
    TextureViewSpecification Single;
    Single.Dimension    = ViewDimension::Planar;
    Single.DimensionSet = true;
    RadianceView_ = Exchange_.ConstructView(RadianceTexture_, Single);
    // 📝 The recombined refresh, before its temporal antialiasing: the environment is drawn with this refresh's jittered depth and
    //    rays (EnvironmentVisibility.slang reconstructs them through the jittered view projection), and the antialiasing then
    //    integrates the overlaid image with its history, as it integrates the demo's own sky.
    ImportGroup_ = Exchange_.ConstructDescriptorGroup(
        ImportLayout_, {Host.RefreshRegion, Host.Display->RecombinedView, Host.Surface->DepthView, LayerViews[0], LayerViews[1],
                        LayerViews[2], LayerViews[3], ImportRegion_, RadianceView_},
        "Environment visibility");
    TargetExtent_     = Extent;
    ScreenGeneration_ = Host.ScreenGeneration;
    return RadianceView_ && ImportGroup_;
}

void EnvironmentOverlay::ResolveRealm(const IlluminationHost& Host, const SceneEnvironment& S, const CameraPose& Camera, double Latitude, double Longitude)
{
    const double Sidereal = ResolveSiderealAngle(Host.LastCelestial.JulianDay, Longitude);
    PlanetaryRealmEnsemble& Ensemble = Planetary_->Ensemble;
    PlanetaryCameraView&    View     = Planetary_->View;
    Ensemble.Portals.clear();
    Ensemble.Realms.resize(1);
    PlanetaryRealm& R = Ensemble.Realms[0];
    R.Name = "SceneViewport";

    // ① atmosphere: the level's scattering scales on the Earth reference (turbidity 2.4 ≙ the reference aerosol load)
    const AtmosphereParameters Air = ResolveAtmosphereParameters(S);
    R.Atmosphere              = Air;
    R.ObserverAltitudeKm      = ObserverAltitudeKm;
    R.GroundPlaneY            = 0.0f;
    R.EnableAerialPerspective = S.Atmosphere.Enabled && S.Atmosphere.AerialPerspective;

    // ② the sun the illumination refresh just resolved, at the top of the atmosphere, in the environment's radiometric scale
    R.Suns.clear();
    if (S.Solar.Enabled)
    {
        RealmSolarSource Sun;
        Sun.DirectionUnit = ProjectEnvironmentAxes(Host.LastLight.SunDirection);
        const Vector3& Tint = Host.Atmosphere->SolarTint;
        const double   E    = Host.Settings.SolarIlluminance * RadianceScale_;
        Sun.DiscIrradiance  = {static_cast<float>(Tint[0] * E), static_cast<float>(Tint[1] * E), static_cast<float>(Tint[2] * E)};
        Sun.Disc.AngularRadiusRad   = 0.5 * std::max(0.05, static_cast<double>(S.Solar.AngularDiameterDeg)) * DegreesToRadian;
        Sun.EnableLensFlare         = S.Flare.Enabled;
        Sun.MasterFlareGain         = std::max(0.0f, S.Flare.Intensity);
        Sun.HaloRadiusNdc           = std::clamp(S.Flare.HaloRadius, 0.05f, 1.2f);
        Sun.ChromaticShift          = 0.012f * std::max(0.0f, S.Flare.ChromaticDispersion) / 0.18f;
        Sun.Flare.ApertureBlades    = std::clamp<uint32_t>(S.Flare.ApertureBladeCount, 3u, 12u);
        Sun.Flare.AnamorphicStrength = S.Flare.AnamorphicStreak ? 1.0 : 0.0;
        Sun.Flare.StarburstStrength  = S.Flare.DiffractionStarburst ? 1.0 : 0.0;
        R.Suns.push_back(Sun);
    }

    // ③ Luna and a second body on the observer's equator path; the phase follows the sun–moon geometry
    R.Moons.clear();
    if (S.Moons.Enabled)
    {
        LunarBodyDescriptor Luna;
        Luna.Preset            = LunarBodyPreset::Luna;
        Luna.DirectionUnit     = ToVec3(ProjectEnvironmentAxes(ResolveMoonDirection(S.Moons.PrimaryOrbitDegrees, Latitude)));
        Luna.AngularRadiusRad  = 0.022f;
        Luna.SurfaceBrightness = 1.6f * std::max(0.05f, S.Moons.PrimaryAlbedo / 0.12f);
        Luna.EarthshineStrength = 0.0022f * std::max(0.0f, S.Moons.EarthshineLuminance / 0.22f);
        R.Moons.push_back(Luna);
        if (S.Moons.SecondaryMoonEnabled)
        {
            LunarBodyDescriptor Ember;
            Ember.Preset            = LunarBodyPreset::Ember;
            Ember.DirectionUnit     = ToVec3(ProjectEnvironmentAxes(ResolveMoonDirection(S.Moons.SecondaryOrbitDegrees, Latitude)));
            Ember.AngularRadiusRad  = 0.013f;
            Ember.SurfaceBrightness = 1.4f;
            R.Moons.push_back(Ember);
        }
    }

    // ④ Hipparcos stars and the planets of the demo's own orbital solver, turned with the sky
    const double Drift = S.ElapsedSeconds * std::max(0.0f, S.Stars.SiderealSpeed) * SiderealRate;
    const double φ     = Latitude * DegreesToRadian;
    const double Δ     = Sidereal + Drift - CatalogueSidereal;
    R.StarBasisRow0          = {static_cast<float>(std::cos(Δ)), static_cast<float>(std::cos(φ) * std::sin(Δ)), static_cast<float>(std::sin(φ) * std::sin(Δ))};
    R.StarBasisRow1          = {0.0f, static_cast<float>(std::sin(φ)), static_cast<float>(-std::cos(φ))};
    // 📝 Stars and the Milky Way carry fixed radiance: scaled so that, under the refresh's night exposure (≤ 0.82), they read
    //    as under the environment's own night exposure (2.9) — 2.9 / 0.82 in environment units, then the refresh scale.
    const float Starlight    = static_cast<float>(2.9 / 0.82 * RadianceScale_);
    R.StarBrightnessScale    = S.Stars.Enabled ? std::max(0.0f, S.Stars.MagnitudeGain) * Starlight : 0.0f;
    R.MilkyWayIntensity      = S.Stars.Enabled ? std::max(0.0f, S.Stars.MilkyWayLuminance / 0.55f) * Starlight : 0.0f;
    R.ScintillationStrength  = std::max(0.0f, S.Stars.AtmosphericScintillate / 0.35f);
    // 📝 N(m) ≈ 10^(0.4·m + 1.3) stars brighter than magnitude m over the whole sky.
    R.StarLimitingMagnitude  = static_cast<float>(std::clamp((std::log10(std::max<double>(10.0, S.Stars.HipparcosCount)) - 1.3) / 0.4, 2.0, 8.0));
    // 📝 The planets of the demo's own orbital solver, each from its Scene Directory entry (Venus, Jupiter, Mars, Saturn).
    R.Planets.clear();
    {
        const Vector3 Pole = {0.0, std::cos(φ), std::sin(φ)};
        for (const PlanetConfiguration& Planet : S.Planets)
        {
            const size_t Body = std::min<size_t>(Planet.Body, PlanetArchetypes.size() - 1);
            if (!Planet.Enabled || Body >= Host.LastCelestial.Planets.size()) continue;
            PlanetaryBodyDescriptor Descriptor;
            Descriptor.Archetype          = PlanetArchetypes[Body];
            Descriptor.DirectionUnit      = ToVec3(ProjectEnvironmentAxes(RotateAbout(Host.LastCelestial.Planets[Body].Direction, Pole, -Drift)));
            Descriptor.AngularRadiusRad   = static_cast<float>(0.5 * std::clamp(static_cast<double>(Planet.ApparentDiameterDegrees), 0.05, 6.0) * DegreesToRadian);
            Descriptor.SurfaceAlbedoScale = std::max(0.0f, Planet.Brightness);
            Descriptor.SpinAxisUnit       = {0.12f, 0.97f, 0.21f};
            Descriptor.ProceduralSeed     = 7u + static_cast<uint32_t>(Body) * 13u;
            Descriptor.Rings.Enabled      = Planet.RingSystem;
            Descriptor.Atmosphere.Enabled = Planet.AtmosphereShell;
            R.Planets.push_back(Descriptor);
        }
    }

    // ⑤ one planetary cloud slab advected by the wind
    R.CloudVolumes.clear();
    R.CloudWindSeconds = (S.Wind.Enabled && S.Wind.AdvectClouds) ? static_cast<float>(S.ElapsedSeconds) : 0.0f;
    if (S.Clouds.Enabled)
    {
        CloudVolumeProfile Slab;
        Slab.Domain              = CloudVolumeDomain::PlanetarySlab;
        Slab.HeightProfile       = TroposphericCloudProfile::Cumulus;
        Slab.Slab.LowerHeightM   = std::max(50.0f, S.Clouds.BaseAltitudeMetres);
        Slab.Slab.TopHeightM     = Slab.Slab.LowerHeightM + std::max(50.0f, S.Clouds.LayerThicknessMetres);
        Slab.Slab.Coverage       = std::clamp(S.Clouds.Coverage, 0.0f, 1.0f);
        Slab.Slab.DensityScale   = std::max(0.0f, S.Clouds.ExtinctionDensity / 0.85f);
        Slab.Slab.WindXMps       = S.Clouds.WindDriftSpeed;
        Slab.PowderStrength      = 0.85 * std::clamp(S.Clouds.SilverLiningPower / 0.72f, 0.0f, 2.0f);
        R.CloudVolumes.push_back(Slab);
    }

    // ⑥ analytic height fog, lit by the scene's own street and lamp-post luminaires
    R.HeightFog              = FogParameters{};
    R.HeightFog.ReferenceDensity = S.Fog.Enabled ? std::max(0.0f, S.Fog.BaseDensity) : 0.0;
    R.HeightFog.ReferenceHeightM = S.Fog.BaseAltitudeMetres;
    R.HeightFog.FalloffHeightM   = 1.0 / std::max(1.0e-3f, S.Fog.HeightFalloff);
    R.HeightFogPhaseG            = std::clamp(S.Fog.PhaseAnisotropy, -0.9f, 0.9f);
    R.LocalFogVolumes.clear();
    R.Luminaires.clear();
    if (S.Fog.Enabled && S.Fog.BaseDensity > 0.0f)
    {
        for (const LuminaireProfile& Lamp : Host.Luminaires.Luminaires)
        {
            if (Lamp.Category != LuminaireCategory::StreetLamp && Lamp.Category != LuminaireCategory::Omni) continue;
            PhotometricFogLuminaire Fixture;
            Fixture.PositionM     = ToSpatial(ProjectEnvironmentAxes(Lamp.Position));
            Fixture.AxisUnit      = ToSpatial(ProjectEnvironmentAxes(Lamp.Direction));
            const double Peak     = Lamp.Intensity * RadianceScale_;
            Fixture.PeakIntensity = {Lamp.Colour[0] * Peak, Lamp.Colour[1] * Peak, Lamp.Colour[2] * Peak};
            Fixture.OuterConeCos  = Lamp.Category == LuminaireCategory::StreetLamp ? Lamp.Params[1] : -1.0;
            Fixture.InnerConeCos  = Lamp.Category == LuminaireCategory::StreetLamp ? Lamp.Params[0] : -1.0;
            Fixture.RangeMeters   = Lamp.Reach;
            R.Luminaires.push_back(Fixture);
        }
    }
    R.LightningChannels.clear();
    R.RadiantFacets.clear();
    R.SolidOccluders.clear();
    R.GlassPanes.clear();
    R.CustomStars.clear();

    // 📝 The LUTs rebake only when their inputs change: the atmosphere revision hashes the medium, the sky-view revision the
    //    medium and the sun.
    uint64_t Medium = 1469598103934665603ull;
    Medium = HashScalar(Medium, Air.GroundRadiusKm);
    Medium = HashScalar(Medium, Air.TopRadiusKm);
    Medium = HashScalar(Medium, Air.RayleighScattering);
    Medium = HashScalar(Medium, Air.MieScattering);
    Medium = HashScalar(Medium, Air.MieAbsorption);
    Medium = HashScalar(Medium, Air.MiePhaseG);
    Medium = HashScalar(Medium, Air.OzoneAbsorption);
    Medium = HashScalar(Medium, R.ObserverAltitudeKm);
    uint64_t Sky = Medium;
    for (const RealmSolarSource& Sun : R.Suns)
    {
        Sky = HashScalar(Sky, Sun.DirectionUnit);
        Sky = HashScalar(Sky, Sun.DiscIrradiance);
    }
    Sky = HashScalar(Sky, R.TwilightStrength);
    R.AtmosphereRevision = Medium | 1ull;
    R.SkyViewRevision    = Sky | 1ull;

    // ⑦ the illumination camera, un-jittered, on the environment's axes
    const Vector3 Forward = NormalizeVector(SubtractVector(Camera.Target, Camera.Position));
    const Vector3 Right   = NormalizeVector(CrossVector(Forward, Camera.Up));
    const Vector3 Up      = CrossVector(Right, Forward);
    View.ActiveRealmIndex = 0;
    View.PositionMeters   = ProjectEnvironmentAxes(Camera.Position);
    View.RightUnit        = ProjectEnvironmentAxes(Right);
    View.UpUnit           = ProjectEnvironmentAxes(Up);
    View.ForwardUnit      = ProjectEnvironmentAxes(Forward);
    View.VerticalFovRad   = static_cast<float>(Camera.VerticalFieldOfView);
    View.ExposureScale    = 1.0f;
    View.ElapsedSeconds   = static_cast<float>(S.ElapsedSeconds);
    View.FrameIndex       = RefreshIndex_;
    View.ViewportWidth    = Host.ScreenExtent[0];
    View.ViewportHeight   = Host.ScreenExtent[1];
}

bool EnvironmentOverlay::PrepareInterlude(IlluminationHost& Host, const SceneEnvironment& Environment, const CameraPose& Camera, double Latitude,
                                          double Longitude, bool LightScene, RefreshInterlude& OutInterlude, std::string* OutDiagnostic)
{
    if (!Constructed_ || !ReconstructTargets(Host, Host.ScreenExtent[0], Host.ScreenExtent[1]))
    {
        if (OutDiagnostic != nullptr) *OutDiagnostic = "environment targets unavailable";
        return false;
    }
    // 📝 Written before the resolve submission the import pass belongs to (queue writes land ahead of it).
    RadianceScale_ = ResolveEnvironmentRadianceScale(Environment);
    const float Profile[4] = {static_cast<float>(RadianceScale_), 0.0f, 0.0f, 0.0f};
    Exchange_.WriteRegion(ImportRegion_, 0, Profile, sizeof(Profile));
    const uint32_t GroupsX = (Host.ScreenExtent[0] + 7) / 8, GroupsY = (Host.ScreenExtent[1] + 7) / 8;
    OutInterlude.AfterRecombination = [this, GroupsX, GroupsY](CommandSequence& Sequence, uint32_t) {
        Sequence.BindProgram(ImportProgram_);
        Sequence.BindGroup(0, ImportGroup_);
        Sequence.Dispatch(GroupsX, GroupsY);
    };
    OutInterlude.BeforeAntialias = [this, GroupsX, GroupsY](CommandSequence& Sequence, uint32_t) {
        Sequence.BindProgram(RestoreProgram_);
        Sequence.BindGroup(0, ImportGroup_);
        Sequence.Dispatch(GroupsX, GroupsY);
    };
    if (LightScene)
    {
        OutInterlude.AdjustLight = [this, &Host, Environment, Latitude](LightSolution& Light) { AdjustLight(Host, Environment, Latitude, Light); };
        OutInterlude.BeforeRecording = [this, &Host, Environment, Camera, Latitude, Longitude]() {
            // 📝 The light of this refresh is final: the realm, its sky and its cloud shadows first, so the refresh samples them.
            ResolveRealm(Host, Environment, Camera, Latitude, Longitude);
            return Planetary_->Sequence.ExecuteSkyAndShadows(Environment_, Planetary_->Ensemble, Planetary_->View) && ReconstructLighting(Host, Environment);
        };
        const TextureSpecification& Sky    = Host.Atmosphere->SkyTexture->Specification;
        const TextureSpecification& Clouds = Host.CloudShadowTexture->Specification;
        OutInterlude.AfterSkyView = [this, SkyGroups = std::array<uint32_t, 2>{(Sky.Width + 7) / 8, (Sky.Height + 7) / 8},
                                     CloudGroups = std::array<uint32_t, 2>{(Clouds.Width + 7) / 8, (Clouds.Height + 7) / 8}](CommandSequence& Sequence) {
            Sequence.BindProgram(SkyProgram_);
            Sequence.BindGroup(0, LightingGroup_);
            Sequence.Dispatch(SkyGroups[0], SkyGroups[1]);
            Sequence.BindProgram(CloudShadowProgram_);
            Sequence.BindGroup(0, LightingGroup_);
            Sequence.Dispatch(CloudGroups[0], CloudGroups[1]);
        };
    }
    OutInterlude.Execute = [this, &Host, Environment, Camera, Latitude, Longitude, LightScene]() {
        // 📝 Runs after the resolve submission: the light, celestial placement, luminaires and sun cascades of this refresh are final.
        if (!LightScene) ResolveRealm(Host, Environment, Camera, Latitude, Longitude);
        ConfigureFogShadow(Host, Environment);
        ++RefreshIndex_;
        return Planetary_->Sequence.ExecuteOverVisibility(Environment_, Planetary_->Ensemble, Planetary_->View);
    };
    OutInterlude.AntialiasSource = RadianceView_;
    return true;
}

} // namespace Frontier::GlobalIllumination
