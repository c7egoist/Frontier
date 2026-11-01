/*==========================================================================================================================================
                                                          ILLUMINATIONHOST.CPP
==========================================================================================================================================*/
// 🧩 Bring-up of every illumination stage in the demo's order, then the refresh: invalidate, relight, gather, resolve, present.

#include "IlluminationHost.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>

namespace Frontier::GlobalIllumination
{

namespace
{
constexpr uint32_t RefreshConstantsBytes = 1072;    // [B] RefreshConstants (268 floats)
constexpr uint32_t VehicleProfileBytes   = 10448;   // [B] VehicleProfile
constexpr uint32_t EffectProfileBytes    = 1120;    // [B] EffectProfile
constexpr double   Pi                    = 3.141592653589793;

// 📝 The demo's EnvironmentSettings is one object: the keys AtmosphereIntegrator reads mirror the environment's own.
void SynchronizeAtmosphere(EnvironmentSettings& Environment)
{
    AtmosphereSettings& Air = Environment.Atmosphere;
    Air.SunEnabled        = Environment.SunEnabled;
    Air.SunTemperature    = Environment.SunTemperature;
    Air.MoonElevation     = Environment.PrimaryMoon.MoonElevation;
    Air.MoonAzimuth       = Environment.PrimaryMoon.MoonAzimuth;
    Air.MoonEnabled       = Environment.PrimaryMoon.MoonEnabled;
    Air.MoonBrightness    = Environment.PrimaryMoon.MoonBrightness;
    Air.MoonPhase         = Environment.PrimaryMoon.MoonPhase;
    Air.HorizonGlow       = Environment.HorizonGlow;
    Air.AtmosphereEnabled = Environment.AtmosphereEnabled;
}

// 📝 Trailing number of an occupant name ("Light pole head 7" → 7), −1 when absent.
int32_t ParseTrailingIndex(const std::string& Name)
{
    size_t Start = Name.size();
    while (Start > 0 && Name[Start - 1] >= '0' && Name[Start - 1] <= '9') --Start;
    return Start == Name.size() ? -1 : std::atoi(Name.c_str() + Start);
}
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
    if (Assets.OmitVehicle)
    {
        // 📝 Inactive occupants are skipped by every step (draws, distance union, cards, TLAS), exactly like idle fragments.
        for (int32_t Index : {Scene.VehicleBody, Scene.VehicleWheels[0], Scene.VehicleWheels[1], Scene.VehicleWheels[2], Scene.VehicleWheels[3]})
            if (Index >= 0 && static_cast<size_t>(Index) < Scene.Occupants.size()) Scene.Occupants[Index].Inactive = true;
    }
    ResolveLampPlacements();

    // ① records every stage shares
    const std::vector<uint8_t> VertexStream = Scene.EncodeVertexStream();
    VertexRegion    = Exchange.ConstructRegionFrom(VertexStream.data(), VertexStream.size(), "Facet vertices");
    MaterialRegion  = Exchange.ConstructRegionFrom(Assets.MaterialProfiles.data(), Assets.MaterialProfiles.size(), "Materials");
    RefreshRegion   = Exchange.ConstructRegion(RefreshConstantsBytes, "Refresh constants");
    LuminaireRegion = Exchange.ConstructRegion(LuminaireRegisterBytes, "Clustered luminaire profiles");
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
    Shaders.ConfigureConstants(ConstructSpecializationConstants({Grade.Steps, Cards->GroundFirstCard, Cards->GroundStripCard,
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
    ++ScreenGeneration;
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
    Capture.Usage       = TextureUsage::RenderAttachment | TextureUsage::CopySource | TextureUsage::Sampled;
    Capture.ViewFormats = {TextureFormat::Rgba8UnormSrgb};
    CaptureTexture = Exchange.ConstructTexture(Capture);
    TextureViewSpecification SrgbView;
    SrgbView.Format    = TextureFormat::Rgba8UnormSrgb;
    SrgbView.FormatSet = true;
    CaptureView = Exchange.ConstructView(CaptureTexture, SrgbView);
}

void IlluminationHost::ResolveLampPlacements()
{
    // 📝 IlluminationHost.js filters ResolveLevelPlacements() by shape; each placement became the occupant of that name.
    std::vector<std::pair<int32_t, LampPlacement>> Poles, Lanterns;
    for (const OccupantEntry& Occupant : Scene.Occupants)
    {
        const bool Pole    = Occupant.Name.rfind("Light pole head ", 0) == 0;
        const bool Lantern = Occupant.Name.rfind("Point lamp lantern ", 0) == 0;
        if (!Pole && !Lantern) continue;
        const LampPlacement Placement{Occupant.Current[12], Occupant.Current[13], Occupant.Current[14]};
        (Pole ? Poles : Lanterns).emplace_back(ParseTrailingIndex(Occupant.Name), Placement);
    }
    auto Ordered = [](std::vector<std::pair<int32_t, LampPlacement>>& Entries) {
        std::stable_sort(Entries.begin(), Entries.end(), [](const auto& A, const auto& B) { return A.first < B.first; });
        std::vector<LampPlacement> Placements;
        for (const auto& Entry : Entries) Placements.push_back(Entry.second);
        return Placements;
    };
    StreetLampPoles = Ordered(Poles);
    PointLampPosts  = Ordered(Lanterns);
}

bool IlluminationHost::AdvanceRefresh(const RefreshInputs* Inputs, const RefreshWriteSupplier& Prepare, const RefreshWriteSupplier& Supplier,
                                      std::string* OutDiagnostic, const RefreshInterlude* Interlude)
{
    const uint32_t Parity = RefreshIndex & 1u;
    // ① scene motion (transforms of the dynamic occupants) is supplied before the host derives anything from it
    if (Prepare) Prepare(RefreshIndex);
    // ② celestial placement, light, refresh constants, the dynamic occupants' profiles, the luminaire table
    CelestialSolution Celestial{};
    EnvironmentSettings* Environment = Inputs != nullptr ? Inputs->Environment : nullptr;
    if (Environment != nullptr)
    {
        Celestial     = AdvanceCelestial(*Environment, Inputs->CelestialDelta);
        LastCelestial = Celestial;
        SynchronizeAtmosphere(*Environment);
        Settings.SunElevation     = Environment->SunElevation;
        Settings.SunAzimuth       = Environment->SunAzimuth;
        Settings.SolarIlluminance = Environment->SolarIlluminance;
        Settings.Atmosphere       = Environment->Atmosphere;
    }
    const LightSolution Light = Atmosphere->ResolveLight(Settings.SunElevation, Settings.SunAzimuth, Settings.SolarIlluminance, Settings.Atmosphere);
    LastLight = Light;
    // 📝 A light that turns by more than 10° or changes brightness by more than 30 % relights every card and restarts history.
    const double Brightness = Light.Illuminance[0] + Light.Illuminance[1] + Light.Illuminance[2];
    if (PriorLight)
    {
        const double Cosine = Light.Direction[0] * PriorLight->first[0] + Light.Direction[1] * PriorLight->first[1] + Light.Direction[2] * PriorLight->first[2];
        const double Ratio  = std::abs(Brightness - PriorLight->second) / std::max({Brightness, PriorLight->second, 1.0e-4});
        if (Cosine < std::cos(10.0 * Pi / 180.0) || Ratio > 0.3)
        {
            Cards->InvalidateLighting();
            PriorValid = false;
        }
    }
    PriorLight = std::make_pair(Light.Direction, Brightness);
    if (Inputs != nullptr)
    {
        RefreshExternalInputs External = Inputs->External;
        if (Environment != nullptr)
        {
            EnvironmentLight Sky;
            Sky.SunDirection     = Light.SunDirection;
            Sky.SolarIlluminance = Light.SolarIlluminance;
            for (const HorizontalPlacement& Planet : Celestial.Planets) Sky.Planets.push_back(Planet.Direction);
            Sky.Sidereal   = ResolveSiderealAngle(Celestial.JulianDay, Environment->Longitude);
            Sky.PixelAngle = 2 * std::tan(Inputs->Camera.VerticalFieldOfView / 2) / ScreenExtent[1];
            External.EnvironmentBlock = EnvironmentEncoding.Encode(*Environment, Sky);
        }
        const std::vector<uint8_t> Constants = Encoder.Encode(Inputs->Camera, Light, Inputs->Toggles, External, ScreenExtent, TraceExtent,
                                                              Settings.TraceScale, RefreshIndex, Inputs->Focus, PriorValid);
        Exchange.WriteRegion(RefreshRegion, 0, Constants.data(), Constants.size());
        const std::vector<uint8_t> Dynamic = Scene.EncodeOccupantProfiles(&Volumes->Volumes, Scene.DynamicCount);
        Exchange.WriteRegion(OccupantRegion, 0, Dynamic.data(), Dynamic.size());
        if (Inputs->LuminairesLive)
        {
            const std::vector<uint8_t> Packed = Luminaires.Update(Inputs->VehicleTransform, StreetLampPoles, PointLampPosts);
            Exchange.WriteRegion(LuminaireRegion, 0, Packed.data(), Packed.size());
        }
    }
    // ③ invalidation and relighting schedules
    RayTracing->RefreshTlas(Scene, nullptr);
    if (Scene.ConstructDistanceList()) Distance->UploadDistanceList(Scene.DistanceList);
    if (Inputs != nullptr) Distance->ScheduleInvalidation(Inputs->Focus, ResolveMovedBounds(Scene, Distance->Frozen));
    Cards->ScheduleTiles(Settings.CardTileBudget);
    if (Inputs != nullptr) Shadow->ResolveCascades(Inputs->Camera, Light.Direction);
    if (Supplier) Supplier(RefreshIndex);

    // ④ record, in the demo's order
    CommandSequence Sequence = Exchange.BeginSequence();
    Atmosphere->RecordSkyView(Sequence, Settings.SolarIlluminance);
    Volumes->RecordFragments(Sequence);
    if (Inputs != nullptr)
    {
        Distance->RecordUnion(Sequence, Scene.QueryUnionCount(), RefreshIndex);
    }
    else
    {
        // 📝 Replay: the bricks and the distance constants were supplied; dispatch the union over them.
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
    if (Interlude == nullptr)
    {
        Display->RecordPresent(Sequence, Parity, CaptureView, Distance->MarchGroup);
        if (!Exchange.Submit(Sequence, OutDiagnostic)) return false;
    }
    else
    {
        // 📝 Resolve → outside work on the same queue → present; the trailing dependency orders later submissions (the
        //    editor interface sampling the presented image) after the present raster.
        if (Interlude->AfterResolve) Interlude->AfterResolve(Sequence, Parity);
        if (!Exchange.Submit(Sequence, OutDiagnostic)) return false;
        if (Interlude->Execute && !Interlude->Execute())
        {
            if (OutDiagnostic != nullptr && OutDiagnostic->empty()) *OutDiagnostic = "refresh interlude failed";
            return false;
        }
        CommandSequence Presentation = Exchange.BeginSequence();
        if (Interlude->BeforePresent) Interlude->BeforePresent(Presentation, Parity);
        Display->RecordPresent(Presentation, Parity, CaptureView, Distance->MarchGroup, Interlude->PresentSource);
        Presentation.OrderAfterEarlierWork();
        if (!Exchange.Submit(Presentation, OutDiagnostic)) return false;
    }
    PriorValid = true;
    ++RefreshIndex;
    return true;
}

} // namespace Frontier::GlobalIllumination
