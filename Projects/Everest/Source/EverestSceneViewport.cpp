/*==========================================================================================================================================
                                                      EVERESTSCENEVIEWPORT.CPP
==========================================================================================================================================*/
// 🧩 Project Everest's live Scene Viewport: the level's environment and render-pipeline records drive the engine SceneViewport
//    (ported VehicleHMI ReSTIR GI of the proving ground + the PlanetaryAtmosphere environment) on the host's device.

#include "EverestSceneViewport.h"

#include "Engine/Diagnostics/DiagnosticJournal.h"
#include "Engine/Diagnostics/LogCategories.h"
#include "Engine/Diagnostics/LogStream.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>

namespace Everest
{

namespace
{

template <typename EntryType> const EntryType* FindEntry(const Frontier::SceneWorld& World, const char* Type)
{
    return dynamic_cast<const EntryType*>(const_cast<Frontier::SceneWorld&>(World).FindFirstByType(Type));
}

// 📝 Copies an entry's configuration, or disables its effect when the level has no such entry.
template <typename EntryType, typename Configuration>
void ReadConfiguration(const Frontier::SceneWorld& World, const char* Type, Configuration& Target)
{
    if (const EntryType* Entry = FindEntry<EntryType>(World, Type)) Target = Entry->QueryConfiguration();
    else Target.Enabled = false;
}

std::filesystem::path ResolveArchive(const std::filesystem::path& ProjectRoot, const char* Archive)
{
    // 📝 The project's staged import first, the engine's tracked archive as the fallback (unstaged checkouts).
    const std::filesystem::path Staged = ProjectRoot / "Content" / "EnvironmentArchives" / Archive;
    if (std::filesystem::exists(Staged)) return Staged;
    const std::filesystem::path Engine = ProjectRoot.parent_path().parent_path() / "EngineContent" / "EnvironmentArchives" / Archive;
    return std::filesystem::exists(Engine) ? Engine : Staged;
}

uint32_t ViewportLogCategory()
{
    return Frontier::LogCategories().Register("Viewport", Frontier::LogColour::Mint, true);
}

} // namespace

Frontier::SolarPlacement SolveSolarPlacement(const Frontier::SolarPlacementQuery& Query)
{
    Frontier::GlobalIllumination::EnvironmentSettings Settings;
    Settings.SkyDate   = Query.CalendarDate;
    Settings.Latitude  = Query.LatitudeDegrees;
    Settings.Longitude = Query.LongitudeDegrees;
    Settings.TimeZone  = Query.UtcOffsetHours;
    Settings.SunTime   = Query.LocalSolarHours;
    const Frontier::GlobalIllumination::CelestialSolution Solved = Frontier::GlobalIllumination::SolveCelestial(Settings);
    return {Solved.Sun.Elevation, Solved.Sun.Azimuth};
}

bool AdvanceSolarDay(Frontier::SolarConfiguration& Sun, double DeltaSeconds)
{
    // 📝 AdvanceCelestial: SunTime = (SunTime + Δt · 24 / (DayDuration · 3600)) mod 24, and the cycle links the sun.
    if (Sun.DayCycle)
    {
        const double Advanced = static_cast<double>(Sun.LocalSolarHours) +
                                std::max(0.0, DeltaSeconds) * 24.0 / (std::max(0.01, static_cast<double>(Sun.DayDurationHours)) * 3600.0);
        Sun.LocalSolarHours = static_cast<float>(std::fmod(Advanced, 24.0));
        Sun.TimeLinked      = true;
    }
    if (!Sun.TimeLinked) return false;
    const Frontier::SolarPlacement Placement = SolveSolarPlacement(
        {Sun.CalendarDate, Sun.LatitudeDegrees, Sun.LongitudeDegrees, Sun.UtcOffsetHours, Sun.LocalSolarHours});
    const auto Elevation = static_cast<float>(Placement.ElevationDegrees);
    const auto Azimuth   = static_cast<float>(Placement.AzimuthDegrees);
    if (Elevation == Sun.ElevationDegrees && Azimuth == Sun.AzimuthDegrees) return false;
    Sun.ElevationDegrees = Elevation;
    Sun.AzimuthDegrees   = Azimuth;
    return true;
}

Frontier::GlobalIllumination::SceneEnvironment ResolveSceneEnvironment(const Frontier::SceneWorld& World, double ElapsedSeconds)
{
    Frontier::GlobalIllumination::SceneEnvironment Environment;
    ReadConfiguration<Frontier::SolarRecord>(World, "Solar", Environment.Solar);
    ReadConfiguration<Frontier::OpticalFlareRecord>(World, "OpticalFlare", Environment.Flare);
    ReadConfiguration<Frontier::AtmosphereRecord>(World, "Atmosphere", Environment.Atmosphere);
    ReadConfiguration<Frontier::CloudRecord>(World, "Clouds", Environment.Clouds);
    ReadConfiguration<Frontier::StarRecord>(World, "Stars", Environment.Stars);
    ReadConfiguration<Frontier::MoonRecord>(World, "Moons", Environment.Moons);
    ReadConfiguration<Frontier::FogRecord>(World, "Fog", Environment.Fog);
    ReadConfiguration<Frontier::WindRecord>(World, "Wind", Environment.Wind);
    // 📝 Each planet entry drives the body it names; a level without planet entries keeps the four default planets.
    const std::vector<const Frontier::SceneRecordBase*> Planets = World.FindAllByType("Planet");
    if (!Planets.empty())
    {
        for (Frontier::PlanetConfiguration& Planet : Environment.Planets) Planet.Enabled = false;
        for (const Frontier::SceneRecordBase* Entry : Planets)
        {
            if (const auto* Planet = dynamic_cast<const Frontier::PlanetRecord*>(Entry))
            {
                const Frontier::PlanetConfiguration& Configuration = Planet->QueryConfiguration();
                Environment.Planets[std::min<uint32_t>(Configuration.Body, 3u)] = Configuration;
            }
        }
    }
    // 📝 The flare belongs to the sun: no sun, no flare.
    Environment.Flare.Enabled  = Environment.Flare.Enabled && Environment.Solar.Enabled;
    Environment.ElapsedSeconds = ElapsedSeconds;
    return Environment;
}

EverestSceneViewport::EverestSceneViewport(std::filesystem::path ProjectRoot, std::filesystem::path ShaderRoot, const Frontier::VulkanDeviceAccess* HostDevice)
    : ProjectRoot_(std::move(ProjectRoot)), ShaderRoot_(std::move(ShaderRoot)), HostDeviceAttached_(HostDevice != nullptr)
{
    if (HostDevice != nullptr) Device_ = *HostDevice;
}

SceneViewportRefresh EverestSceneViewport::Render(const SceneViewportRequest& Request, const Frontier::SceneWorld& World, double ElapsedSeconds)
{
    SceneViewportRefresh Outcome;
    Frontier::RenderPipelineConfiguration Pipeline;
    if (const auto* Entry = FindEntry<Frontier::RenderPipelineRecord>(World, "RenderPipeline")) Pipeline = Entry->QueryConfiguration();
    const std::string Quality    = Pipeline.QualityTier <= 0 ? "low" : (Pipeline.QualityTier == 1 ? "medium" : "high");
    const bool        RayTracing = Pipeline.HardwareRayQueryTier;
    Outcome.Readout.Quality = Quality;
    if (!Pipeline.Enabled)
    {
        Outcome.Status          = "Render pipeline disabled";
        Outcome.Readout.Failure = Outcome.Status;
        return Outcome;
    }
    if (HostDeviceAttached_ && !Device_.Valid())
    {
        Outcome.Status          = "Scene viewport needs a Vulkan 1.3 adapter with dynamic rendering";
        Outcome.Readout.Failure = Outcome.Status;
        return Outcome;
    }

    // ① (re)build when the tiers change; a failed bring-up is not retried until they change again
    if (!Viewport_ || Quality != Quality_ || RayTracing != RayTracing_)
    {
        if (!Failure_.empty() && Quality == Quality_ && RayTracing == RayTracing_)
        {
            Outcome.Status          = Failure_;
            Outcome.Readout.Failure = Failure_;
            return Outcome;
        }
        Viewport_.reset();
        Quality_    = Quality;
        RayTracing_ = RayTracing;
        Failure_.clear();
        Frontier::GlobalIllumination::SceneViewportConfiguration Configuration;
        Configuration.GlobalIlluminationShaders = ShaderRoot_ / "GlobalIllumination";
        Configuration.EnvironmentShaders        = ShaderRoot_ / "Environment";
        Configuration.SceneArchive              = ResolveArchive(ProjectRoot_, "ProvingGround");
        Configuration.CelestialMaps             = ResolveArchive(ProjectRoot_, "CelestialMaps");
        Configuration.Quality                   = Quality;
        Configuration.RayTracing                = RayTracing;
        // 🔍 Every bring-up step and device fault lands in the diagnostic journal as it happens (a lost device still leaves
        //    the step it struck in the log).
        Configuration.Journal = [](const std::string& Line) { Frontier::DiagnosticJournal::Append("SceneViewport", Line); };
        const auto Extent = Frontier::GlobalIllumination::SceneViewport::ResolveScreenExtent(Request.PanelWidth, Request.PanelHeight, Request.PixelDensity, Quality);
        auto Candidate = std::make_unique<Frontier::GlobalIllumination::SceneViewport>();
        std::string Diagnostic;
        const auto  Start = std::chrono::steady_clock::now();
        if (!Candidate->Construct(HostDeviceAttached_ ? &Device_ : nullptr, Configuration, Extent, &Diagnostic))
        {
            Failure_ = "Scene viewport unavailable: " + Diagnostic;
            Frontier::WriteLogFormat(ViewportLogCategory(), Frontier::LogSeverity::Error, Frontier::LogVerbosity::Log, "SceneViewport", "%s",
                                     Failure_.c_str());
            Outcome.Status          = Failure_;
            Outcome.Readout.Failure = Failure_;
            return Outcome;
        }
        Viewport_ = std::move(Candidate);
        Frontier::WriteLogFormat(ViewportLogCategory(), Frontier::LogSeverity::Info, Frontier::LogVerbosity::Log, "SceneViewport",
                                 "Proving ground up on %s in %.1f s (%s, %s, vehicle omitted).", Viewport_->QueryAdapter().c_str(),
                                 std::chrono::duration<double>(std::chrono::steady_clock::now() - Start).count(), Quality.c_str(),
                                 RayTracing ? "RTX ReSTIR" : "GTX distance field");
    }

    // ② one refresh through the level's records
    Frontier::GlobalIllumination::ViewportCamera Camera;
    Camera.Position            = {Request.CameraPosition[0], Request.CameraPosition[1], Request.CameraPosition[2]};
    Camera.Target              = {Request.CameraTarget[0], Request.CameraTarget[1], Request.CameraTarget[2]};
    Camera.VerticalFieldOfView = Request.VerticalFieldOfView;
    Frontier::GlobalIllumination::ViewportRendering Rendering;
    Rendering.GlobalIllumination   = Pipeline.GlobalIllumination;
    Rendering.TemporalAntiAliasing = Pipeline.TemporalAntiAliasing;
    Rendering.ExposureCompensation = Pipeline.ExposureCompensationEv;
    Rendering.Inspection           = static_cast<uint32_t>(std::clamp(Pipeline.InspectionModeIndex, 0, 14));
    Rendering.DistanceSlice        = Request.DistanceSlice;
    // 📝 Screen targets follow the panel once its size held still for six interface ticks (a dragged splitter would rebuild
    //    them on every tick); meanwhile the last extent stretches over the panel.
    const auto Requested = Frontier::GlobalIllumination::SceneViewport::ResolveScreenExtent(Request.PanelWidth, Request.PanelHeight, Request.PixelDensity, Quality);
    StableExtentCount_ = Requested == RequestedExtent_ ? StableExtentCount_ + 1 : 0;
    RequestedExtent_   = Requested;
    const auto Extent = StableExtentCount_ >= 6 ? Requested : Viewport_->QueryScreenExtent();
    std::string Diagnostic;
    const auto  Start = std::chrono::steady_clock::now();
    if (!Viewport_->Refresh(Camera, ResolveSceneEnvironment(World, ElapsedSeconds), Rendering, Request.DeltaSeconds, Extent, &Diagnostic))
    {
        Failure_ = "Scene viewport refresh failed: " + Diagnostic;
        Frontier::WriteLogFormat(ViewportLogCategory(), Frontier::LogSeverity::Error, Frontier::LogVerbosity::Log, "SceneViewport", "%s",
                                 Failure_.c_str());
        Viewport_.reset();
        Outcome.Status          = Failure_;
        Outcome.Readout.Failure = Failure_;
        return Outcome;
    }
    const double Milliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - Start).count();
    RefreshMilliseconds_      = RefreshMilliseconds_ <= 0.0 ? Milliseconds : RefreshMilliseconds_ * 0.9 + Milliseconds * 0.1;
    Outcome.View   = Viewport_->QueryPresentedView();
    Outcome.Extent = Viewport_->QueryScreenExtent();
    char Status[160];
    std::snprintf(Status, sizeof(Status), "LIVE: ReSTIR GI %s + PlanetaryAtmosphere  |  %u x %u  |  %.1f ms", RayTracing ? "RTX" : "GTX", Outcome.Extent[0],
                  Outcome.Extent[1], RefreshMilliseconds_);
    Outcome.Status = Status;

    // 📝 The demo's readout figures (IlluminationHost.js PresentMeasurements): renderer tag and the TLAS line.
    const Frontier::GlobalIllumination::ViewportStatistics Statistics = Viewport_->QueryStatistics();
    char Tag[96];
    if (Statistics.RayTracing)
    {
        std::snprintf(Tag, sizeof(Tag), "RTX ReSTIR PT (%uB GI \xC2\xB7 %uB Refl \xC2\xB7 M=%u)", Statistics.MaxBounces, Statistics.ReflectionBounces,
                      Statistics.InitialCandidates);
        char Acceleration[160];
        std::snprintf(Acceleration, sizeof(Acceleration), "BVH hierarchy   TLAS %u instances (%u nodes) \xC2\xB7 BLAS %u tris", Statistics.TlasInstances,
                      Statistics.TlasEntries, Statistics.BlasTriangles);
        Outcome.Readout.AccelerationLine = Acceleration;
    }
    else
    {
        std::snprintf(Tag, sizeof(Tag), "GTX SDF GI");
    }
    Outcome.Readout.Presenting          = Outcome.View != VK_NULL_HANDLE;
    Outcome.Readout.Adapter             = Viewport_->QueryAdapter();
    Outcome.Readout.RendererTag         = Tag;
    Outcome.Readout.ScreenExtent        = Statistics.ScreenExtent;
    Outcome.Readout.TraceExtent         = Statistics.TraceExtent;
    Outcome.Readout.RefreshMilliseconds = RefreshMilliseconds_;
    return Outcome;
}

} // namespace Everest
