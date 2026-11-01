/*==========================================================================================================================================
                                                          ILLUMINATIONHOST.CPP
==========================================================================================================================================*/
// 🧩 Bring-up of every illumination stage in the demo's order, then the refresh: invalidate, relight, gather, resolve, present.

#include "IlluminationHost.h"

#include <cstring>

namespace Frontier::Illumination
{

namespace
{
constexpr uint32_t RefreshConstantsBytes = 1072;    // [B] RefreshConstants (268 floats)
constexpr uint32_t LuminaireTableBytes   = 12320;   // [B] ClusteredLightTable
constexpr uint32_t VehicleProfileBytes   = 10448;   // [B] VehicleProfile
constexpr uint32_t EffectProfileBytes    = 1120;    // [B] EffectProfile
} // namespace

IlluminationHost::IlluminationHost(DeviceExchange& ExchangeInstance, std::filesystem::path SpirvFolder)
    : Exchange(ExchangeInstance), Shaders(ExchangeInstance, std::move(SpirvFolder))
{
}

bool IlluminationHost::Construct(const IlluminationAssets& Assets, const IlluminationSettings& Configuration, std::array<uint32_t, 2> Extent,
                                 std::string* OutDiagnostic)
{
    Settings = Configuration;
    Grade    = ResolveQualityGrade(Settings.Quality);
    if (Settings.CardTileBudget == 0) Settings.CardTileBudget = Grade.TileBudget;
    if (!Scene.LoadFacetSpace(Assets.FacetSpace, OutDiagnostic)) return false;

    // ① records every stage shares
    const std::vector<uint8_t> VertexStream = Scene.EncodeVertexStream();
    VertexRegion    = Exchange.ConstructRegionFrom(VertexStream.data(), VertexStream.size(), "Facet vertices");
    MaterialRegion  = Exchange.ConstructRegionFrom(Assets.MaterialProfiles.data(), Assets.MaterialProfiles.size(), "Materials");
    RefreshRegion   = Exchange.ConstructRegion(RefreshConstantsBytes, "Refresh constants");
    LuminaireRegion = Exchange.ConstructRegion(LuminaireTableBytes, "Clustered luminaire profiles");
    OccupantRegion  = Exchange.ConstructRegion(static_cast<VkDeviceSize>(Scene.Occupants.size()) * OccupantStride, "Occupant profiles");

    // ② per-occupant distance volumes
    Volumes = std::make_unique<OccupantDistanceSpace>(Exchange, Shaders);
    if (!Volumes->ConstructVolumes(Scene, Grade.VoxelScale, OutDiagnostic)) return false;

    // ③ surface cards, then the occupant profiles that reference volumes and cards
    Cards = std::make_unique<SurfaceCardDepot>(Exchange, Shaders, SurfaceCardConfiguration{Grade.CardExtent, Grade.CardDensity});
    Cards->AllocateCards(Scene);
    const std::vector<uint8_t> Profiles = Scene.EncodeOccupantProfiles(&Volumes->Volumes, static_cast<uint32_t>(Scene.Occupants.size()));
    Exchange.WriteRegion(OccupantRegion, 0, Profiles.data(), Profiles.size());
    Scene.ConstructDrawRuns();

    // ③b two-level acceleration structure
    RayTracing = std::make_unique<RayTracingSpace>(Exchange);
    RayTracing->ConstructResources(Scene, MaterialRegion, LuminaireRegion);
    Shaders.ConfigureConstants(ConstructSpecializationValues({Grade.Steps, Cards->GroundFirstCard, Cards->GroundStripCard,
                                                              static_cast<uint32_t>(Scene.GroundOccupant)}));

    // ④ the scene distance field
    Distance = std::make_unique<SceneDistanceSpace>(Exchange, Shaders,
                                                    SceneDistanceConfiguration{4, Grade.ClipResolution, Grade.FinestVoxel, 6.0, 0.2});
    Distance->ConstructResources(Volumes->TextureView, OccupantRegion);
    Scene.ConstructDistanceList();
    Distance->UploadDistanceList(Scene.DistanceList);
    Volumes->ConstructFragmentProgram();

    // ⑤ every remaining stage
    Atmosphere = std::make_unique<AtmosphereIntegrator>(Exchange, Shaders);
    Atmosphere->ConstructResources();
    Shadow = std::make_unique<ShadowProjection>(Exchange, Shaders, Grade.ShadowExtent);
    Shadow->ConstructResources(OccupantRegion);
    Cards->ConstructResources(RefreshRegion, OccupantRegion, MaterialRegion, Distance->MarchLayout, LuminaireRegion);
    {
        TextureSpecification Stars;
        Stars.Label  = "Native star catalogue cells + records";
        Stars.Width  = 1024;
        Stars.Height = std::max(1u, Assets.StarCatalogueRows);
        Stars.Format = TextureFormat::Rgba32Float;
        Stars.Usage  = TextureUsage::Sampled | TextureUsage::CopyTarget;
        StarCatalogueTexture = Exchange.ConstructTexture(Stars);
        if (!Assets.StarCatalogue.empty()) Exchange.WriteTexture(StarCatalogueTexture, 0, Assets.StarCatalogue.data(), Assets.StarCatalogue.size(), 1024, Stars.Height);
        TextureSpecification Moon;
        Moon.Label         = "Native six-body lunar atlas · 2K sRGB";
        Moon.Width         = 2048;
        Moon.Height        = 1024;
        Moon.DepthOrLayers = 6;
        Moon.Format        = TextureFormat::Rgba8UnormSrgb;
        Moon.Usage         = TextureUsage::Sampled | TextureUsage::CopyTarget;
        MoonAtlasTexture = Exchange.ConstructTexture(Moon);
        if (Assets.MoonAtlas.size() == static_cast<size_t>(2048) * 1024 * 4 * 6)
        {
            for (uint32_t Layer = 0; Layer < 6; ++Layer)
            {
                Exchange.WriteTexture(MoonAtlasTexture, Layer, Assets.MoonAtlas.data() + static_cast<size_t>(Layer) * 2048 * 1024 * 4,
                                      static_cast<size_t>(2048) * 1024 * 4, 2048, 1024);
            }
        }
    }
    TextureViewSpecification Layered;
    Layered.Dimension    = ViewDimension::PlanarLayered;
    Layered.DimensionSet = true;
    SamplingGroup = Cards->ConstructSamplingGroup(OccupantRegion, Atmosphere->SkyView, Atmosphere->SkySampler,
                                                  Exchange.ConstructView(MoonAtlasTexture, Layered), Exchange.ConstructView(StarCatalogueTexture));

    // 📝 Buffers of systems outside the port, at their idle content (tyre deposit, derez effect, vehicle visual, clouds).
    TextureSpecification Deposit;
    Deposit.Label  = "Rubber and rim scrape deposit";
    Deposit.Width  = 4096;
    Deposit.Height = 2340;
    Deposit.Format = TextureFormat::Rgba8Unorm;
    Deposit.Usage  = TextureUsage::Sampled | TextureUsage::CopyTarget;
    TyreMarkTexture = Exchange.ConstructTexture(Deposit);
    SamplerSpecification DepositSampling;
    DepositSampling.MagFilter = DepositSampling.MinFilter = FilterMode::Linear;
    auto DepositSampler = Exchange.ConstructSampler(DepositSampling);
    VehicleRegion     = Exchange.ConstructRegion(VehicleProfileBytes, "Vehicle record");
    EffectRegion      = Exchange.ConstructRegion(EffectProfileBytes, "Effect record");
    CloudShadowParams = Exchange.ConstructRegion(48, "Projected cloud shadows");
    CloudParams       = Exchange.ConstructRegion(544, "Cloud renderer v2");
    TextureSpecification CloudShadow;
    CloudShadow.Label  = "Cloud shadow optical depth";
    CloudShadow.Width  = 128;
    CloudShadow.Height = 128;
    CloudShadow.Usage  = TextureUsage::Storage | TextureUsage::Sampled;
    CloudShadowTexture = Exchange.ConstructTexture(CloudShadow);
    TextureSpecification CloudTarget;
    CloudTarget.Usage = TextureUsage::Storage | TextureUsage::Sampled;
    CloudTarget.Label = "Cloud optical integration";
    CloudColourTexture = Exchange.ConstructTexture(CloudTarget);
    CloudTarget.Label = "Cloud depth guide";
    CloudGuideTexture  = Exchange.ConstructTexture(CloudTarget);

    Shadow->ConstructMaskedProgram(OccupantRegion, EffectRegion, VehicleRegion);
    Surface = std::make_unique<SurfaceProjection>(Exchange, Shaders);
    Surface->ConstructPrograms(RefreshRegion, OccupantRegion, MaterialRegion, Distance->MarchLayout, Cards->SamplingLayout, RayTracing->MarchLayout,
                               Exchange.ConstructView(TyreMarkTexture), DepositSampler, EffectRegion, VehicleRegion);
    Resampling = std::make_unique<ResamplingSequence>(Exchange, Shaders);
    Resampling->ConstructPrograms(RefreshRegion, MaterialRegion, Distance->MarchLayout, Cards->SamplingLayout, RayTracing->MarchLayout);
    Diffuse = std::make_unique<VarianceIntegrator>(Exchange, Shaders, "Diffuse", VarianceSettings{0.08f, 24, 3, 4.0f});
    Diffuse->ConstructPrograms(RefreshRegion);
    Glossy = std::make_unique<VarianceIntegrator>(Exchange, Shaders, "Glossy", VarianceSettings{0.12f, 12, 2, 3.0f});
    Glossy->ConstructPrograms(RefreshRegion);
    Display = std::make_unique<DisplayProjection>(Exchange, Shaders);
    Display->ConstructPrograms(RefreshRegion, MaterialRegion, Distance->MarchLayout, OccupantRegion, TextureFormat::Rgba8UnormSrgb);
    for (const auto& [Offset, Bytes] : Assets.MaterialRewrites)
    {
        Exchange.WriteRegion(MaterialRegion, Offset, Bytes.data(), Bytes.size());
    }

    Cards->CaptureCards(Scene, VertexRegion);
    ReconstructScreenTargets(Extent);
    return true;
}

void IlluminationHost::ReconstructScreenTargets(std::array<uint32_t, 2> Extent)
{
    ScreenExtent = Extent;
    TraceExtent  = {(Extent[0] + Settings.TraceScale - 1) / Settings.TraceScale, (Extent[1] + Settings.TraceScale - 1) / Settings.TraceScale};
    SamplerSpecification CloudSampling;
    CloudSampling.MagFilter = CloudSampling.MinFilter = FilterMode::Linear;
    SurfaceTargetInputs Inputs{Shadow->LayeredView, Shadow->ComparisonSampler, Shadow->ReceiverRegion, Atmosphere->SkyView, Atmosphere->SkySampler,
                               LuminaireRegion, CloudShadowParams, Exchange.ConstructView(CloudShadowTexture), Exchange.ConstructSampler(CloudSampling)};
    Surface->ConstructTargets(Extent[0], Extent[1], Inputs);
    Resampling->ConstructTargets(TraceExtent, *Surface);
    Diffuse->ConstructTargets(TraceExtent, ScreenExtent, *Surface, {Resampling->IrradianceView, Resampling->IrradianceView}, Resampling->GuideViews);
    Glossy->ConstructTargets(TraceExtent, ScreenExtent, *Surface, {Resampling->ReflectionView, Resampling->ReflectionView}, Resampling->GuideViews);
    auto CloudColour = Exchange.ConstructView(CloudColourTexture);
    DisplayNeutralResources Neutral{CloudParams, CloudColour, Exchange.ConstructView(CloudGuideTexture), CloudColour};
    Display->ConstructTargets(ScreenExtent, *Surface, *Resampling, *Diffuse, *Glossy, *Cards, Neutral);
    PriorValid = false;
    TextureSpecification Capture;
    Capture.Label       = "Capture";
    Capture.Width       = Extent[0];
    Capture.Height      = Extent[1];
    Capture.Format      = TextureFormat::Rgba8Unorm;
    Capture.Usage       = TextureUsage::RenderAttachment | TextureUsage::CopySource;
    Capture.ViewFormats = {TextureFormat::Rgba8UnormSrgb};
    CaptureTexture = Exchange.ConstructTexture(Capture);
    TextureViewSpecification SrgbView;
    SrgbView.Format    = TextureFormat::Rgba8UnormSrgb;
    SrgbView.FormatSet = true;
    CaptureView = Exchange.ConstructView(CaptureTexture, SrgbView);
}

bool IlluminationHost::AdvanceRefresh(const RefreshWriteSupplier& Prepare, const RefreshWriteSupplier& Supplier, std::string* OutDiagnostic)
{
    const uint32_t Parity = RefreshIndex & 1u;
    // ① scene motion (transforms of the dynamic occupants) is supplied before the host derives anything from it
    if (Prepare) Prepare(RefreshIndex);
    // ② light (the sky-view key and the atmosphere constants come from it)
    Atmosphere->ResolveLight(Settings.SunElevation, Settings.SunAzimuth, Settings.SolarIlluminance, Settings.Atmosphere);
    // ③ invalidation and relighting schedules
    RayTracing->RefreshTlas(Scene, nullptr);
    if (Scene.ConstructDistanceList()) Distance->UploadDistanceList(Scene.DistanceList);
    Cards->ScheduleTiles(Settings.CardTileBudget);
    if (Supplier) Supplier(RefreshIndex);

    // ④ record, in the demo's order
    CommandSequence Sequence = Exchange.BeginSequence();
    Atmosphere->RecordSkyView(Sequence, Settings.SolarIlluminance);
    Volumes->RecordFragments(Sequence);
    {
        // 📝 The union's brick count travels in the distance constants the supplier (or the schedule) wrote.
        const uint32_t BrickCount = static_cast<uint32_t>(Distance->RefreshBricks.size() / 4);
        if (BrickCount > 0)
        {
            Sequence.BindProgram(Distance->UnionProgram);
            Sequence.BindGroup(0, Distance->UnionGroup);
            Sequence.Dispatch(std::min(BrickCount, 65535u), (BrickCount + 65534u) / 65535u);
        }
    }
    Shadow->RecordCascades(Sequence, Scene, VertexRegion);
    Cards->RecordLighting(Sequence, Distance->MarchGroup, SamplingGroup, Settings.CardRadiosity);
    Surface->RecordSurface(Sequence, Scene, VertexRegion);
    Surface->RecordDirect(Sequence, Distance->MarchGroup, SamplingGroup, RayTracing->MarchGroup);
    if (Settings.Indirect)
    {
        Resampling->RecordResampling(Sequence, Parity, Distance->MarchGroup, SamplingGroup, RayTracing->MarchGroup);
        Diffuse->Record(Sequence, Parity, Settings.VarianceFilter);
    }
    if (Settings.Reflection)
    {
        Resampling->RecordReflection(Sequence, Distance->MarchGroup, SamplingGroup, RayTracing->MarchGroup);
        Glossy->Record(Sequence, Parity, Settings.VarianceFilter);
    }
    Display->RecordResolve(Sequence, Parity);
    Display->RecordPresent(Sequence, Parity, CaptureView, Distance->MarchGroup);
    if (!Exchange.Submit(Sequence, OutDiagnostic)) return false;
    PriorValid = true;
    ++RefreshIndex;
    return true;
}

} // namespace Frontier::Illumination
