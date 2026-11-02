/*==========================================================================================================================================
                                                     RAYTRACEDLIGHTINGCAPTURE.CPP
==========================================================================================================================================*/
// 🧩 Ray-traced reflections and sun shadows of the RTX path in the editor's own scene viewport, offscreen: one camera view under
//    a set of variants (the demo, its options, the refinements), each measured by fireflies, temporal noise, distance from a
//    converged reference, refresh time and the cost of every refresh stage.

// 📝 Usage: RayTracedLightingCapture <GlobalIllumination shaders> <Environment shaders> <ProvingGround> <CelestialMaps> <out>
//    <view[,view…]> <variant[,variant…]> [warm refreshes] [measured refreshes] [indirect 0|1] [width] [height]. Time is frozen so nothing but the
//    estimators changes between refreshes; each variant starts from a cleared history. Views and variants: the tables below.
#include "Frontier/Engine/Rendering/SceneViewport/SceneViewport.h"
#include "stb_image_write.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <map>
#include <sstream>
#include <string>
#include <vector>
using namespace Frontier;
using namespace Frontier::GlobalIllumination;

namespace
{
struct ViewSpecification
{
    const char*        Name;
    Vector3            Position, Target;
    std::array<int, 4> Region;   // [px] x0 y0 x1 y1 of the measured region at 480×270, scaled to the extent
};
// 📝 The proving ground's glossy surfaces: the glass and tempered panes (roughness 0.04 / 0.06), the cones (0.22), the control
//    tower's cabin glass (0.04); shadows: a light pole's head and mast (11 m, penumbra 0 → ~17 cm) and the tower's.
const ViewSpecification Views[] = {
    {"PaneNear", {3.0, -23.6, 1.5}, {6.0, -27.2, 1.0}, {0, 0, 480, 270}},
    {"ConesNear", {-33.2, 18.6, 1.3}, {-30.0, 15.2, 0.3}, {0, 0, 480, 270}},
    {"PenumbraNear", {-3.0, -4.5, 2.5}, {-5.8, -1.0, 0.0}, {0, 0, 480, 270}},
    {"TowerShadow", {-37.0, -13.0, 4.0}, {-46.0, -20.0, 0.0}, {0, 100, 480, 270}},
};

struct VariantSpecification
{
    const char* Name;
    uint32_t    Refinements;
    bool        RayTracedShadows;
    bool        VarianceFilter;
};
namespace R = RefinementBit;
const VariantSpecification Variants[] = {
    {"Demo", 0u, true, true},                       // the 1:1 port
    {"Unfiltered", 0u, true, false},                // the demo without its variance filters ("without the blur")
    {"Cascades", 0u, false, true},                  // the demo's raster cascades instead of ray-traced sun shadows (as GTX)
    {"SolarDisc", R::SolarDisc, true, true},
    {"StratifiedSun", R::SolarDisc | R::StratifiedSun, true, true},
    {"PenumbraFilter", R::SolarDisc | R::StratifiedSun | R::PenumbraFilter, true, true},
    {"MirrorFilter", R::SolarDisc | R::MirrorFilter, true, true},
    {"MirrorTrace", R::SolarDisc | R::MirrorFilter | R::MirrorTrace, true, true},
    {"Refined", R::SolarDisc | R::StratifiedSun | R::PenumbraFilter | R::MirrorFilter | R::MirrorTrace, true, true},
    {"Reference", R::SolarDisc | R::StratifiedSun | R::MirrorFilter | R::MirrorTrace, true, true},   // unbiased and sharp
};

double DisplayLuminance(const uint8_t* Texel)
{
    return (0.2126 * Texel[0] + 0.7152 * Texel[1] + 0.0722 * Texel[2]) / 255.0;
}

// 📝 A firefly: a pixel brighter than every one of its 8 neighbours by over 0.12 of full scale and over 1.6× their mean.
uint32_t CountFireflies(const std::vector<uint8_t>& Rgba, uint32_t Width, uint32_t Height, const std::array<int, 4>& Region)
{
    uint32_t Count = 0;
    for (int Y = std::max(1, Region[1]); Y < std::min<int>(Height - 1, Region[3]); ++Y)
        for (int X = std::max(1, Region[0]); X < std::min<int>(Width - 1, Region[2]); ++X)
        {
            const double Centre = DisplayLuminance(&Rgba[(static_cast<size_t>(Y) * Width + X) * 4]);
            double Brightest = 0.0, Mean = 0.0;
            for (int DY = -1; DY <= 1; ++DY)
                for (int DX = -1; DX <= 1; ++DX)
                {
                    if (DX == 0 && DY == 0) continue;
                    const double Neighbour = DisplayLuminance(&Rgba[(static_cast<size_t>(Y + DY) * Width + X + DX) * 4]);
                    Brightest = std::max(Brightest, Neighbour);
                    Mean += Neighbour / 8.0;
                }
            if (Centre - Brightest > 0.12 && Centre > 1.6 * Mean) ++Count;
        }
    return Count;
}

struct Measurement
{
    std::string         Variant{};
    double              Fireflies = 0.0;        // [-] per refresh, measured region
    double              RefreshSeconds = 0.0;   // [s] mean
    std::map<std::string, double> Stages{};     // [ms] mean per refresh
    std::vector<double> Mean{};                 // [8-bit levels] per channel
    std::vector<double> Deviation{};            // [8-bit levels] temporal standard deviation per channel
};
} // namespace

int main(int ArgumentCount, char** Arguments)
{
    if (ArgumentCount < 8)
    {
        std::printf("usage: RayTracedLightingCapture <GlobalIllumination shaders> <Environment shaders> <ProvingGround> <CelestialMaps> <out> "
                    "<view> <variant[,variant...]> [warm] [measured] [indirect 0|1] [width] [height]\n");
        return 2;
    }
    std::setvbuf(stdout, nullptr, _IONBF, 0);
    // 📝 Every stage a submission of its own, so the submission timing names each stage's cost.
    setenv("FRONTIER_ILLUMINATION_STAGED_SUBMISSIONS", "1", 1);
    SceneViewportConfiguration Configuration;
    Configuration.GlobalIlluminationShaders = Arguments[1];
    Configuration.EnvironmentShaders        = Arguments[2];
    Configuration.SceneArchive              = Arguments[3];
    Configuration.CelestialMaps             = Arguments[4];
    Configuration.Quality                   = "low";
    const std::filesystem::path OutFolder   = Arguments[5];
    auto SplitList = [](const char* List) {
        std::vector<std::string> Names;
        for (std::stringstream Stream(List); Stream.good();)
        {
            std::string Name;
            std::getline(Stream, Name, ',');
            if (!Name.empty()) Names.push_back(Name);
        }
        return Names;
    };
    const std::vector<std::string> ViewNames    = SplitList(Arguments[6]);
    const std::vector<std::string> VariantNames = SplitList(Arguments[7]);
    const uint32_t Warm     = ArgumentCount > 8 ? static_cast<uint32_t>(std::atoi(Arguments[8])) : 12u;
    const uint32_t Measured = ArgumentCount > 9 ? static_cast<uint32_t>(std::atoi(Arguments[9])) : 12u;
    const bool     Indirect = ArgumentCount > 10 ? std::atoi(Arguments[10]) != 0 : true;
    const uint32_t Width    = ArgumentCount > 11 ? static_cast<uint32_t>(std::atoi(Arguments[11])) : 480u;
    const uint32_t Height   = ArgumentCount > 12 ? static_cast<uint32_t>(std::atoi(Arguments[12])) : 270u;
    std::filesystem::create_directories(OutFolder);
    Configuration.Journal = [](const std::string& Line) { std::printf("  %s\n", Line.c_str()); };

    SceneViewport Viewport;
    std::string   Diagnostic;
    if (!Viewport.Construct(nullptr, Configuration, {Width, Height}, &Diagnostic))
    {
        std::printf("bring-up: %s\n", Diagnostic.c_str());
        return 2;
    }
    IlluminationHost& Host = *Viewport.AccessHost();
    std::printf("device: %s; %u warm + %u measured refreshes; indirect %s; %ux%u\n", Viewport.QueryAdapter().c_str(), Warm, Measured,
                Indirect ? "on" : "off", Width, Height);
    std::map<std::string, double> StageTotals;
    bool Measuring = false;
    Host.Exchange.SubmissionTiming = [&](const std::string& Label, double Milliseconds) {
        if (!Measuring) return;
        const size_t Colon = Label.find(": ");
        StageTotals[Colon == std::string::npos ? Label : Label.substr(Colon + 2)] += Milliseconds;
    };

    SceneEnvironment Environment;
    Environment.Solar.ElevationDegrees   = 38.0f;
    Environment.Solar.AzimuthDegrees     = 132.0f;
    Environment.Solar.IlluminanceKilolux = 98.0f;
    Environment.Clouds.Coverage          = 0.42f;
    Environment.ElapsedSeconds           = 0.0;

    for (const std::string& ViewName : ViewNames)
    {
        const ViewSpecification* View = nullptr;
        for (const ViewSpecification& Candidate : Views)
            if (ViewName == Candidate.Name) View = &Candidate;
        if (!View)
        {
            std::printf("unknown view %s\n", ViewName.c_str());
            return 2;
        }
        const std::array<int, 4> Region = {View->Region[0] * static_cast<int>(Width) / 480, View->Region[1] * static_cast<int>(Height) / 270,
                                           View->Region[2] * static_cast<int>(Width) / 480, View->Region[3] * static_cast<int>(Height) / 270};
        auto Inside = [&](size_t Pixel) {
            const int X = static_cast<int>(Pixel % Width), Y = static_cast<int>(Pixel / Width);
            return X >= Region[0] && X < Region[2] && Y >= Region[1] && Y < Region[3];
        };
        ViewportCamera Camera;
        Camera.Position = View->Position;
        Camera.Target   = View->Target;
        std::vector<Measurement> Results;
        for (const std::string& VariantName : VariantNames)
        {
            const VariantSpecification* Variant = nullptr;
            for (const VariantSpecification& Candidate : Variants)
                if (VariantName == Candidate.Name) Variant = &Candidate;
            if (!Variant)
            {
                std::printf("unknown variant %s\n", VariantName.c_str());
                return 2;
            }
            Host.Settings.VarianceFilter = Variant->VarianceFilter;
            Host.Settings.Indirect       = Indirect;
            Host.PriorValid              = false;   // 📝 a cleared history: the temporal reuse restarts, the antialiasing takes the refresh
            Viewport.ToggleAdjustment = [Variant, Indirect](RefreshToggles& Toggles) {
                Toggles.RayTracedShadows = Variant->RayTracedShadows;
                Toggles.Indirect         = Indirect;
            };
            ViewportRendering Rendering;
            Rendering.Refinements = Variant->Refinements;
            Measurement Result;
            Result.Variant = Variant->Name;
            std::vector<double> Sum(static_cast<size_t>(Width) * Height * 3, 0.0), Square(Sum.size(), 0.0);
            std::vector<uint8_t> Rgba;
            StageTotals.clear();
            for (uint32_t Refresh = 0; Refresh < Warm + Measured; ++Refresh)
            {
                Measuring = Refresh >= Warm;
                const auto Start = std::chrono::steady_clock::now();
                if (!Viewport.Refresh(Camera, Environment, Rendering, 1.0 / 30.0, {Width, Height}, &Diagnostic))
                {
                    std::printf("[FAIL] %s refresh %u: %s\n", Variant->Name, Refresh, Diagnostic.c_str());
                    return 1;
                }
                const double Seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - Start).count();
                if (!Measuring) continue;
                Result.RefreshSeconds += Seconds / Measured;
                if (!Viewport.ReadPresented(Rgba))
                {
                    std::printf("[FAIL] %s readback\n", Variant->Name);
                    return 1;
                }
                Result.Fireflies += static_cast<double>(CountFireflies(Rgba, Width, Height, Region)) / Measured;
                for (size_t Pixel = 0; Pixel < static_cast<size_t>(Width) * Height; ++Pixel)
                    for (int Channel = 0; Channel < 3; ++Channel)
                    {
                        const double Level = Rgba[Pixel * 4 + Channel];
                        Sum[Pixel * 3 + Channel] += Level;
                        Square[Pixel * 3 + Channel] += Level * Level;
                    }
            }
            Measuring = false;
            for (const auto& [Stage, Total] : StageTotals) Result.Stages[Stage] = Total / Measured;
            Result.Mean.resize(Sum.size());
            Result.Deviation.resize(Sum.size());
            for (size_t Index = 0; Index < Sum.size(); ++Index)
            {
                Result.Mean[Index]      = Sum[Index] / Measured;
                Result.Deviation[Index] = std::sqrt(std::max(0.0, Square[Index] / Measured - Result.Mean[Index] * Result.Mean[Index]));
            }
            // 📝 The last refresh and the mean over the measured refreshes.
            const std::string Stem = (OutFolder / (std::string(View->Name) + "-" + Variant->Name)).string();
            stbi_write_png((Stem + ".png").c_str(), static_cast<int>(Width), static_cast<int>(Height), 4, Rgba.data(), static_cast<int>(Width * 4));
            std::vector<uint8_t> MeanRgba(static_cast<size_t>(Width) * Height * 4, 255u);
            for (size_t Pixel = 0; Pixel < static_cast<size_t>(Width) * Height; ++Pixel)
                for (int Channel = 0; Channel < 3; ++Channel)
                    MeanRgba[Pixel * 4 + Channel] = static_cast<uint8_t>(std::clamp(Result.Mean[Pixel * 3 + Channel] + 0.5, 0.0, 255.0));
            stbi_write_png((Stem + "-Mean.png").c_str(), static_cast<int>(Width), static_cast<int>(Height), 4, MeanRgba.data(), static_cast<int>(Width * 4));
            std::printf("%s/%s: fireflies %.1f per refresh, refresh %.3f s\n", View->Name, Variant->Name, Result.Fireflies, Result.RefreshSeconds);
            for (const auto& [Stage, Milliseconds] : Result.Stages) std::printf("    stage %-28s %9.1f ms\n", Stage.c_str(), Milliseconds);
            Results.push_back(std::move(Result));
        }

        // 📝 Edges: pixels whose 5×5 neighbourhood in the reference mean spans more than 24 levels of luminance (shadow edges,
        //    reflected detail); noise and distance are reported over the measured region and over its edges.
        const Measurement* Reference = nullptr;
        for (const Measurement& Result : Results)
            if (Result.Variant == "Reference") Reference = &Result;
        std::vector<uint8_t> Edge(static_cast<size_t>(Width) * Height, 0u);
        if (Reference)
        {
            auto Luminance = [&](int X, int Y) {
                const size_t Index = (static_cast<size_t>(Y) * Width + X) * 3;
                return 0.2126 * Reference->Mean[Index] + 0.7152 * Reference->Mean[Index + 1] + 0.0722 * Reference->Mean[Index + 2];
            };
            for (int Y = 2; Y < static_cast<int>(Height) - 2; ++Y)
                for (int X = 2; X < static_cast<int>(Width) - 2; ++X)
                {
                    double Low = 1e9, High = -1e9;
                    for (int DY = -2; DY <= 2; ++DY)
                        for (int DX = -2; DX <= 2; ++DX)
                        {
                            const double L = Luminance(X + DX, Y + DY);
                            Low = std::min(Low, L);
                            High = std::max(High, L);
                        }
                    Edge[static_cast<size_t>(Y) * Width + X] = High - Low > 24.0 ? 1u : 0u;
                }
        }
        std::printf("\n%s\n| Variant | Fireflies / refresh | Noise [levels] | Edge noise | RMS from reference | Edge RMS | Refresh [s] |\n"
                    "|---|---:|---:|---:|---:|---:|---:|\n",
                    View->Name);
        for (Measurement& Result : Results)
        {
            double NoiseSum = 0.0, EdgeNoiseSum = 0.0, SquareSum = 0.0, EdgeSquareSum = 0.0;
            uint32_t Count = 0, EdgeCount = 0;
            for (size_t Index = 0; Index < Result.Mean.size(); ++Index)
            {
                const size_t Pixel = Index / 3;
                if (!Inside(Pixel)) continue;
                const double Difference = Reference ? Result.Mean[Index] - Reference->Mean[Index] : 0.0;
                NoiseSum += Result.Deviation[Index];
                SquareSum += Difference * Difference;
                ++Count;
                if (Edge[Pixel])
                {
                    EdgeNoiseSum += Result.Deviation[Index];
                    EdgeSquareSum += Difference * Difference;
                    ++EdgeCount;
                }
            }
            auto Format = [](double Number, bool Present) {
                char Text[32];
                std::snprintf(Text, sizeof(Text), Present ? "%.2f" : "-", Number);
                return std::string(Text);
            };
            std::printf("| %s | %.1f | %.2f | %s | %s | %s | %.3f |\n", Result.Variant.c_str(), Result.Fireflies, NoiseSum / std::max(1u, Count),
                        Format(EdgeNoiseSum / std::max(1u, EdgeCount), EdgeCount > 0).c_str(),
                        Format(std::sqrt(SquareSum / std::max(1u, Count)), Reference != nullptr).c_str(),
                        Format(std::sqrt(EdgeSquareSum / std::max(1u, EdgeCount)), Reference != nullptr && EdgeCount > 0).c_str(), Result.RefreshSeconds);
        }
        std::printf("(%u edge pixels of %u in the measured region)\n\n",
                    static_cast<unsigned>(std::count(Edge.begin(), Edge.end(), 1u)),
                    static_cast<unsigned>((Region[2] - Region[0]) * (Region[3] - Region[1])));
    }
    return 0;
}
