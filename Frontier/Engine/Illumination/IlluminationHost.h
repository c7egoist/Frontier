/*==========================================================================================================================================
                                                           ILLUMINATIONHOST.H
==========================================================================================================================================*/
// 🧩 Bring-up of every illumination stage in the demo's order, then the refresh: invalidate, relight, gather, resolve, present.

#pragma once

#include "AtmosphereIntegrator.h"
#include "DisplayProjection.h"
#include "IlluminationConstants.h"
#include "OccupantDistanceSpace.h"
#include "RayTracingSpace.h"
#include "ResamplingSequence.h"
#include "SceneDistanceSpace.h"
#include "SceneStructure.h"
#include "ShadowProjection.h"
#include "SurfaceCardDepot.h"
#include "SurfaceProjection.h"

#include <filesystem>
#include <functional>

namespace Frontier::Illumination
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
};

// 📝 Per-refresh writes not produced by the ported host modules (camera-, physics- and effect-driven buffers); a replay
//    supplies them from a capture, the editor from its own scene.
using RefreshWriteSupplier = std::function<void(uint32_t RefreshIndex)>;

class IlluminationHost
{
  public:
    IlluminationHost(DeviceExchange& Exchange, std::filesystem::path SpirvFolder);

    bool Construct(const IlluminationAssets& Assets, const IlluminationSettings& Settings, std::array<uint32_t, 2> ScreenExtent,
                   std::string* OutDiagnostic = nullptr);
    void ReconstructScreenTargets(std::array<uint32_t, 2> ScreenExtent);

    // 📝 One refresh in the demo's recording order; the supplier runs after the host's own writes (later writes win).
    bool AdvanceRefresh(const RefreshWriteSupplier& Prepare, const RefreshWriteSupplier& Supplier, std::string* OutDiagnostic = nullptr);

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
    uint32_t                            RefreshIndex = 0;
    bool                                PriorValid   = false;
};

} // namespace Frontier::Illumination
