/*==========================================================================================================================================
                                                      SCENEVIEWPORTVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 Renders the editor's scene viewport offscreen — the same SceneViewport the Everest workspace presents — through the level's
//    environment records at day, low sun, dusk fog and night, and checks what each image must show.

#include "Frontier/Engine/Rendering/SceneViewport/SceneViewport.h"

#include "stb_image_write.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

using namespace Frontier;
using namespace Frontier::GlobalIllumination;

namespace
{

int Failures = 0;

void ReportCheck(bool Passed, const std::string& Name, const std::string& Detail = "")
{
    std::printf("%s %s%s%s\n", Passed ? "[PASS]" : "[FAIL]", Name.c_str(), Detail.empty() ? "" : " — ", Detail.c_str());
    if (!Passed) ++Failures;
}

// 📝 The records of Projects/Everest/Content/Levels/Default.levelspace (values the level overrides, defaults elsewhere).
SceneEnvironment ConstructLevelEnvironment()
{
    SceneEnvironment S;
    S.Solar.ElevationDegrees      = 38.0f;
    S.Solar.AzimuthDegrees        = 132.0f;
    S.Solar.IlluminanceKilolux    = 98.0f;
    S.Solar.KelvinTemperature     = 5778.0f;
    S.Flare.Intensity             = 0.62f;
    S.Flare.ApertureBladeCount    = 7;
    S.Atmosphere.RayleighScattering   = 1.0f;
    S.Atmosphere.MieTurbidity         = 2.3f;
    S.Atmosphere.OzoneAbsorptionScale = 1.0f;
    S.Clouds.Coverage             = 0.42f;
    S.Clouds.BaseAltitudeMetres   = 1750.0f;
    S.Clouds.LayerThicknessMetres = 1350.0f;
    S.Stars.HipparcosCount        = 5000;
    S.Stars.MagnitudeGain         = 1.15f;
    S.Moons.PrimaryPhase          = 0.68f;
    S.Moons.SecondaryMoonEnabled  = true;
    S.Fog.BaseDensity             = 0.012f;
    S.Fog.HeightFalloff           = 0.14f;
    S.Wind.DirectionDegrees       = 45.0f;
    S.Wind.SpeedMetresPerSecond   = 6.5f;
    S.Wind.CurlNoiseTurbulence    = 0.45f;
    return S;
}

struct ImageStatistics
{
    double SkyLuminance    = 0.0;   // [-] mean over the top eighth
    double GroundLuminance = 0.0;   // [-] mean over the bottom quarter
    double Brightest       = 0.0;   // [-] brightest pixel
    uint32_t StarPixels    = 0;     // [-] isolated bright pixels in the top half
};

double Luminance(const uint8_t* Pixel)
{
    return (0.2126 * Pixel[0] + 0.7152 * Pixel[1] + 0.0722 * Pixel[2]) / 255.0;
}

ImageStatistics Measure(const std::vector<uint8_t>& Rgba, uint32_t Width, uint32_t Height)
{
    ImageStatistics Result;
    size_t SkyCount = 0, GroundCount = 0;
    for (uint32_t Y = 0; Y < Height; ++Y)
    {
        for (uint32_t X = 0; X < Width; ++X)
        {
            const double L = Luminance(&Rgba[(static_cast<size_t>(Y) * Width + X) * 4]);
            Result.Brightest = std::max(Result.Brightest, L);
            if (Y < Height / 8)
            {
                Result.SkyLuminance += L;
                ++SkyCount;
            }
            if (Y >= Height * 3 / 4)
            {
                Result.GroundLuminance += L;
                ++GroundCount;
            }
            if (Y > 0 && Y < Height / 2 && X > 0 && X + 1 < Width)
            {
                const double Around = (Luminance(&Rgba[(static_cast<size_t>(Y) * Width + X - 1) * 4]) +
                                       Luminance(&Rgba[(static_cast<size_t>(Y) * Width + X + 1) * 4]) +
                                       Luminance(&Rgba[(static_cast<size_t>(Y - 1) * Width + X) * 4])) / 3.0;
                if (L > 0.25 && L > Around + 0.15) ++Result.StarPixels;
            }
        }
    }
    Result.SkyLuminance /= std::max<size_t>(1, SkyCount);
    Result.GroundLuminance /= std::max<size_t>(1, GroundCount);
    return Result;
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    if (ArgumentCount < 6)
    {
        std::printf("usage: SceneViewportValidation <GlobalIlluminationShaders> <EnvironmentShaders> <SceneArchive> <CelestialMaps> <OutFolder> "
                    "[Quality] [Width] [Height] [Refreshes]\n");
        return 2;
    }
    std::setvbuf(stdout, nullptr, _IONBF, 0);
    SceneViewportConfiguration Configuration;
    Configuration.GlobalIlluminationShaders = Arguments[1];
    Configuration.EnvironmentShaders  = Arguments[2];
    Configuration.SceneArchive        = Arguments[3];
    Configuration.CelestialMaps       = Arguments[4];
    const std::filesystem::path OutFolder = Arguments[5];
    Configuration.Quality             = ArgumentCount > 6 ? Arguments[6] : "low";
    const uint32_t Width     = ArgumentCount > 7 ? static_cast<uint32_t>(std::atoi(Arguments[7])) : 480u;
    const uint32_t Height    = ArgumentCount > 8 ? static_cast<uint32_t>(std::atoi(Arguments[8])) : 270u;
    const uint32_t Refreshes = ArgumentCount > 9 ? static_cast<uint32_t>(std::atoi(Arguments[9])) : 16u;
    std::filesystem::create_directories(OutFolder);

    SceneViewport Viewport;
    std::string   Diagnostic;
    const auto    BringUp = std::chrono::steady_clock::now();
    if (!Viewport.Construct(nullptr, Configuration, {Width, Height}, &Diagnostic))
    {
        std::printf("bring-up: %s\n", Diagnostic.c_str());
        return 2;
    }
    const double BringUpSeconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - BringUp).count();
    IlluminationHost& Host = *Viewport.AccessHost();
    std::printf("device: %s\nbring-up: %.1f s, %zu occupants (%zu inactive), %u luminaires, environment %s\n", Viewport.QueryAdapter().c_str(),
                BringUpSeconds, Host.Scene.Occupants.size(),
                static_cast<size_t>(std::count_if(Host.Scene.Occupants.begin(), Host.Scene.Occupants.end(), [](const OccupantEntry& O) { return O.Inactive; })),
                static_cast<uint32_t>(Host.StreetLampPoles.size() + Host.PointLampPosts.size()), Viewport.QueryEnvironmentActive() ? "overlaid" : "absent");
    ReportCheck(Viewport.QueryEnvironmentActive(), "PlanetaryAtmosphere overlaid on the illumination device");
    bool VehicleInactive = Host.Scene.VehicleBody >= 0 && Host.Scene.Occupants[Host.Scene.VehicleBody].Inactive;
    for (int32_t Wheel : Host.Scene.VehicleWheels) VehicleInactive = VehicleInactive && Wheel >= 0 && Host.Scene.Occupants[Wheel].Inactive;
    ReportCheck(VehicleInactive, "vehicle body and wheels deactivated (no car)");
    ReportCheck(Host.StreetLampPoles.size() == 20 && Host.PointLampPosts.size() == 10, "street lamps and lamp posts placed from the scene",
                std::to_string(Host.StreetLampPoles.size()) + " + " + std::to_string(Host.PointLampPosts.size()));

    struct Scenario
    {
        const char*      Name;
        ViewportCamera   Camera;
        SceneEnvironment Environment;
    };
    const SceneEnvironment Level = ConstructLevelEnvironment();
    std::vector<Scenario> Scenarios;
    ViewportCamera Course;
    Course.Position = {-70.0, -46.0, 13.0};
    Course.Target   = {-5.0, 10.0, 2.0};
    Scenarios.push_back({"Daylight", Course, Level});
    {
        Scenario LowSun{"LowSunFlare", {}, Level};
        // 📝 A line of sight between the lamp posts (no fixture within 4° of the sun's azimuth from here).
        LowSun.Environment.Solar.ElevationDegrees = 8.0f;
        LowSun.Environment.Solar.AzimuthDegrees   = 20.0f;
        LowSun.Environment.Fog.BaseDensity        = 0.004f;
        LowSun.Camera.Position = {-62.0, -48.0, 3.0};
        LowSun.Camera.Target   = {-62.0 + 60.0 * std::cos(28.0 * 3.14159265358979 / 180.0), -48.0 + 60.0 * std::sin(28.0 * 3.14159265358979 / 180.0), 8.0};
        Scenarios.push_back(LowSun);
    }
    {
        Scenario Dusk{"DuskFogLamps", {}, Level};
        Dusk.Environment.Solar.ElevationDegrees = -4.0f;
        Dusk.Environment.Solar.AzimuthDegrees   = 200.0f;
        Dusk.Environment.Fog.BaseDensity        = 0.02f;
        Dusk.Environment.Fog.HeightFalloff      = 0.08f;
        Dusk.Environment.Clouds.Coverage        = 0.6f;
        Dusk.Camera.Position = {-52.0, -14.0, 5.0};
        Dusk.Camera.Target   = {-10.0, 4.0, 4.0};
        Scenarios.push_back(Dusk);
    }
    {
        Scenario Night{"NightMoonsPlanetsStars", {}, Level};
        Night.Environment.Solar.ElevationDegrees  = -28.0f;
        Night.Environment.Solar.AzimuthDegrees    = 250.0f;
        // 📝 Luna and Ember in view with Jupiter and Mars (the demo's sky for 2026-10-20) above the north-west course.
        Night.Environment.Moons.PrimaryOrbitDegrees   = 138.0f;
        Night.Environment.Moons.SecondaryOrbitDegrees = 158.0f;
        Night.Environment.Fog.BaseDensity         = 0.0015f;
        Night.Environment.Clouds.Coverage         = 0.18f;
        Night.Camera.Position = {20.0, -30.0, 2.5};
        Night.Camera.Target   = {20.0 - 40.0 * 0.86, -30.0 + 40.0 * 0.347, 2.5 + 40.0 * 0.375};
        Scenarios.push_back(Night);
    }

    std::vector<ImageStatistics> Statistics;
    for (const Scenario& Case : Scenarios)
    {
        double Slowest = 0.0, Total = 0.0;
        for (uint32_t Refresh = 0; Refresh < Refreshes; ++Refresh)
        {
            SceneEnvironment Environment = Case.Environment;
            Environment.ElapsedSeconds   = Refresh / 30.0;
            const auto Start = std::chrono::steady_clock::now();
            if (!Viewport.Refresh(Case.Camera, Environment, {}, 1.0 / 30.0, {Width, Height}, &Diagnostic))
            {
                ReportCheck(false, std::string(Case.Name) + " refresh " + std::to_string(Refresh), Diagnostic);
                return 1;
            }
            const double Seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - Start).count();
            Slowest = std::max(Slowest, Seconds);
            Total += Seconds;
        }
        std::vector<uint8_t> Rgba;
        if (!Viewport.ReadPresented(Rgba) || Rgba.size() != static_cast<size_t>(Width) * Height * 4)
        {
            ReportCheck(false, std::string(Case.Name) + " readback");
            return 1;
        }
        const std::string Path = (OutFolder / (std::string(Case.Name) + ".png")).string();
        stbi_write_png(Path.c_str(), static_cast<int>(Width), static_cast<int>(Height), 4, Rgba.data(), static_cast<int>(Width * 4));
        const ImageStatistics Measured = Measure(Rgba, Width, Height);
        Statistics.push_back(Measured);
        char Line[256];
        std::snprintf(Line, sizeof(Line), "%u refreshes, mean %.2f s, slowest %.2f s; sky %.3f, ground %.3f, brightest %.3f, isolated bright pixels %u",
                      Refreshes, Total / Refreshes, Slowest, Measured.SkyLuminance, Measured.GroundLuminance, Measured.Brightest, Measured.StarPixels);
        std::printf("%s: %s → %s\n", Case.Name, Line, Path.c_str());
        ReportCheck(Measured.Brightest > 0.05, std::string(Case.Name) + " presented a lit image");
    }
    // 🔍 what the images must show relative to each other
    ReportCheck(Statistics[0].SkyLuminance > 0.35, "daylight sky is bright", std::to_string(Statistics[0].SkyLuminance));
    ReportCheck(Statistics[1].Brightest > 0.97, "low sun saturates the disc and flare", std::to_string(Statistics[1].Brightest));
    ReportCheck(Statistics[3].SkyLuminance < Statistics[0].SkyLuminance * 0.5, "night sky darker than day",
                std::to_string(Statistics[3].SkyLuminance) + " vs " + std::to_string(Statistics[0].SkyLuminance));
    ReportCheck(Statistics[3].StarPixels > 8, "night sky shows stars", std::to_string(Statistics[3].StarPixels) + " isolated bright pixels");
    std::printf("\n=== scene viewport: %d failing checks\n", Failures);
    return Failures == 0 ? 0 : 1;
}
