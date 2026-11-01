/*==========================================================================================================================================
                                                           ILLUMINATIONHOST.H
==========================================================================================================================================*/
// 🧩 Bring-up of every illumination stage in the demo's order, then the refresh: invalidate, relight, gather, resolve, present.

#pragma once

#include "AtmosphereIntegrator.h"
#include "DisplayProjection.h"
#include "EnvironmentEncoding.h"
#include "IlluminationConstants.h"
#include "LuminaireRegister.h"
#include "OccupantDistanceSpace.h"
#include "RefreshEncoding.h"
#include "RayTracingSpace.h"
#include "ResamplingSequence.h"
#include "SceneDistanceSpace.h"
#include "SceneStructure.h"
#include "ShadowProjection.h"
#include "SurfaceCardDepot.h"
#include "SurfaceProjection.h"

#include <filesystem>
#include <functional>

namespace Frontier::GlobalIllumination
{

// 📝 The demo's FeatureBits (IlluminationHost.js) and the defaults of its Settings.
namespace FeatureBit
{
constexpr uint32_t Indirect             = 1u;
constexpr uint32_t TemporalReuse        = 2u;
constexpr uint32_t SpatialReuse         = 4u;
constexpr uint32_t VisibilityReuse      = 8u;
constexpr uint32_t VarianceFilter       = 16u;
constexpr uint32_t Reflection           = 32u;
constexpr uint32_t CardRadiosity        = 64u;
constexpr uint32_t Antialias            = 128u;
constexpr uint32_t DirectShadow         = 256u;
constexpr uint32_t AutoExposure         = 512u;
constexpr uint32_t RadianceRefresh      = 1024u;
constexpr uint32_t TemporalRestart      = 2048u;
constexpr uint32_t RayTracing           = 8192u;
constexpr uint32_t RayTracedShadows     = 16384u;
constexpr uint32_t RussianRoulette      = 32768u;
constexpr uint32_t FireflyFilter        = 65536u;
constexpr uint32_t MultiBounceNee       = 131072u;
constexpr uint32_t RayTracedReflections = 262144u;
} // namespace FeatureBit

struct IlluminationSettings
{
    std::string Quality            = "high";
    bool        RayTracing         = true;    // [-] RTX ReSTIR path tracer (false = GTX distance-field GI)
    bool        Indirect           = true;
    bool        Reflection         = true;
    bool        VarianceFilter     = true;
    bool        CardRadiosity      = true;
    double      SunElevation       = 38.0;    // [°]
    double      SunAzimuth         = 145.0;   // [°]
    double      SolarIlluminance   = 12.0;    // [-]
    uint32_t    TraceScale         = 2;       // [-]
    uint32_t    CardTileBudget     = 0;       // [-] 0 = the quality grade's budget
    AtmosphereSettings Atmosphere{};
};

struct IlluminationAssets
{
    std::filesystem::path FacetSpace{};                 // [-] Scene.facetspace
    std::vector<uint8_t>  MaterialProfiles{};           // [B] encoded MaterialSpecification records
    std::vector<std::pair<uint32_t, std::vector<uint8_t>>> MaterialRewrites{};   // [B] offset + bytes (derez palette)
    std::vector<uint8_t>  MoonAtlas{};                  // [B] 2048×1024×6 sRGB texels, empty = black
    std::vector<uint8_t>  StarCatalogue{};              // [B] rgba32float texels, 1024 wide
    uint32_t              StarCatalogueRows = 1;
    bool                  OmitVehicle       = false;    // [-] deactivate the vehicle body and wheels before bring-up (no car)
};

// 📝 Per-refresh writes not produced by the ported host modules (camera-, physics- and effect-driven buffers); a replay
//    supplies them from a capture, the editor from its own scene.
using RefreshWriteSupplier = std::function<void(uint32_t RefreshIndex)>;

// 📝 Live inputs of one refresh: the camera the editor (or a capture) resolved, its cascade focus, and the inputs owned
//    by systems outside the port. Without them the refresh is a pure device replay of supplied writes.
//    With Environment set the host runs the demo's own sky path: AdvanceCelestial → ResolveLight → EncodeEnvironment
//    (the environment's sun and atmosphere replace Settings.SunElevation/SunAzimuth/SolarIlluminance/Atmosphere).
//    With LuminairesLive set the host packs the clustered luminaire table (LightingSystem.Update) every refresh.
struct RefreshInputs
{
    CameraPose              Camera{};
    Vector3                  Focus{};
    RefreshToggles           Toggles{};
    RefreshExternalInputs    External{};
    EnvironmentSettings*     Environment    = nullptr;
    double                   CelestialDelta = 0.0;    // [s] elapsed since the previous refresh, for DayAnimate
    bool                     LuminairesLive = false;
    std::optional<Transform> VehicleTransform{};      // [-] body transform when a vehicle carries beams
};

// 📝 Splits a refresh between resolve and present so outside work can run on the same queue: AfterResolve appends
//    commands after the resolve (same submission), Execute runs after that submission completed, BeforePresent opens the
//    present submission, and PresentSource (when set) replaces the radiance the present raster reads.
struct RefreshInterlude
{
    std::function<void(CommandSequence&, uint32_t Parity)> AfterResolve{};
    std::function<bool()>                                  Execute{};
    std::function<void(CommandSequence&, uint32_t Parity)> BeforePresent{};
    std::shared_ptr<DeviceTextureView>                     PresentSource{};
};

class IlluminationHost
{
  public:
    IlluminationHost(DeviceExchange& Exchange, std::filesystem::path SpirvFolder);

    bool Construct(const IlluminationAssets& Assets, const IlluminationSettings& Settings, std::array<uint32_t, 2> ScreenExtent,
                   std::string* OutDiagnostic = nullptr);
    void ReconstructScreenTargets(std::array<uint32_t, 2> ScreenExtent);

    // 📝 One refresh in the demo's recording order; the supplier runs after the host's own writes (later writes win).
    bool AdvanceRefresh(const RefreshInputs* Inputs, const RefreshWriteSupplier& Prepare, const RefreshWriteSupplier& Supplier,
                        std::string* OutDiagnostic = nullptr, const RefreshInterlude* Interlude = nullptr);

    // 📝 Street-lamp heads and lamp-post lanterns of the loaded scene, in placement order (LevelStructure.js).
    void ResolveLampPlacements();

    DeviceExchange&                     Exchange;
    ShaderInterchange                   Shaders;
    IlluminationSettings                Settings{};
    QualityGrade                        Grade{};
    SceneStructure                      Scene{};
    std::unique_ptr<OccupantDistanceSpace> Volumes{};
    std::unique_ptr<SurfaceCardDepot>   Cards{};
    std::unique_ptr<RayTracingSpace>    RayTracing{};
    std::unique_ptr<SceneDistanceSpace> Distance{};
    std::unique_ptr<AtmosphereIntegrator> Atmosphere{};
    std::unique_ptr<ShadowProjection>   Shadow{};
    std::unique_ptr<SurfaceProjection>  Surface{};
    std::unique_ptr<ResamplingSequence> Resampling{};
    std::unique_ptr<VarianceIntegrator> Diffuse{};
    std::unique_ptr<VarianceIntegrator> Glossy{};
    std::unique_ptr<DisplayProjection>  Display{};

    std::shared_ptr<DeviceRegion>       VertexRegion{}, MaterialRegion{}, RefreshRegion{}, LuminaireRegion{}, OccupantRegion{};
    std::shared_ptr<DeviceRegion>       VehicleRegion{}, EffectRegion{}, CloudShadowParams{}, CloudParams{};
    std::shared_ptr<DeviceTexture>      MoonAtlasTexture{}, StarCatalogueTexture{}, TyreMarkTexture{}, CloudShadowTexture{}, CloudColourTexture{},
                                        CloudGuideTexture{}, CaptureTexture{};
    std::shared_ptr<DeviceTextureView>  CaptureView{};
    std::shared_ptr<DescriptorGroup>    SamplingGroup{};
    std::array<uint32_t, 2>             ScreenExtent{0, 0};
    std::array<uint32_t, 2>             TraceExtent{0, 0};
    RefreshEncoder                      Encoder{};
    EnvironmentEncoder                  EnvironmentEncoding{};
    LuminaireRegister                      Luminaires{};
    std::vector<LampPlacement>          StreetLampPoles{}, PointLampPosts{};
    LightSolution                          LastLight{};
    CelestialSolution                   LastCelestial{};
    std::optional<std::pair<Vector3, double>> PriorLight{};   // [-] direction, summed illuminance of the previous refresh
    uint32_t                            RefreshIndex = 0;
    uint32_t                            ScreenGeneration = 0;   // [-] advances whenever the screen targets are rebuilt
    bool                                PriorValid   = false;
};

} // namespace Frontier::GlobalIllumination
