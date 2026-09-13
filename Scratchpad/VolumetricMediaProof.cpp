//============================================================================================================================================
// 📦 Scratchpad/VolumetricMediaProof.cpp — clouds stay in the troposphere, one march serves every medium
//============================================================================================================================================
// Celestial step 5.

#include "DisplayPresentation/VolumetricMedia.h"
#include "SpatialInterface/VolumeMarker.h"
#include "DisplayPresentation/FidelityClassifier.h"

#include <cmath>
#include <cstdio>
#include <cstdint>
#include <initializer_list>

using namespace Frontier;

namespace {
int Failures = 0;
void Expect(bool Condition, const char* What)
{
    if (!Condition) ++Failures;
    std::printf("  %-68s %s\n", What, Condition ? "PASS" : "FAIL");
}
} // namespace

int main()
{
    std::printf("\nVolumetricMedia — clouds, fog, and the markers that move them\n");
    for (int I = 0; I < 108; ++I) std::putchar('=');
    std::printf("\n\n");

    WindSettings Wind{};
    VolumetricBudget Budget{};

    // ── ① the ceiling ──────────────────────────────────────────────────────────────────────────────────────────
    // Clouds are tropospheric. Without a ceiling a Base of 200 km puts cloud OUTSIDE the 100 km atmosphere, which
    // renders happily and shows a shell floating in vacuum from orbit — the thing that looked wrong from space.
    std::printf("1. clouds cannot leave the troposphere\n");
    std::printf("     %12s %12s %12s   %s\n", "requested", "slab base", "slab top", "state");
    {
        bool Clamped = true, Ordinary = true;
        const float Requested[] = { 1500.0f, 8000.0f, 13000.0f, 60000.0f, 200000.0f };
        for (float Base : Requested)
        {
            CloudLayerSettings Cloud{};
            Cloud.Enabled = true; Cloud.Base = Base; Cloud.Thickness = 1200.0f;
            float SlabBase = 0.0f, SlabTop = 0.0f;
            const bool Exists = VolumetricMedia::SlabExtent(Cloud, SlabBase, SlabTop);
            std::printf("     %12.0f %12.0f %12.0f   %s\n", Base, SlabBase, SlabTop,
                        Exists ? "cloud" : "none (above the ceiling)");
            if (SlabTop > Cloud.CeilingMetres + 0.5f) Clamped = false;
            if (Base <= 12000.0f && !Exists) Ordinary = false;
        }
        Expect(Clamped, "no slab ever reaches above the ceiling");
        Expect(Ordinary, "ordinary altitudes still produce a slab");

        // And the density function must agree with the extent, or the march would step through empty space.
        CloudLayerSettings High{};
        High.Enabled = true; High.Base = 100000.0f; High.Thickness = 2000.0f;
        const float Above[3] = { 0.0f, 0.0f, 100500.0f };
        Expect(VolumetricMedia::CloudDensity(High, Wind, Above, 0.0f, 0.0f) == 0.0f,
               "a layer pushed above the ceiling has zero density everywhere");

        // From orbit, looking down, the march must find nothing above the ceiling.
        CloudLayerSettings Normal{};
        Normal.Enabled = true; Normal.Base = 1500.0f; Normal.Thickness = 1200.0f; Normal.Coverage = 0.9f;
        LocalVolumeSettings None{};
        const float Eye[3] = { 0.0f, 0.0f, 400000.0f };
        const float Down[3] = { 0.0f, 0.0f, -1.0f };
        const float Sun[3] = { 0.0f, 0.6f, 0.8f };
        const float Radiance[3] = { 20.0f, 20.0f, 20.0f }, Ambient[3] = { 1.0f, 1.0f, 1.0f };
        const VolumetricSample FromOrbit = VolumetricMedia::March(Normal, None, None, Wind, Budget,
                                                                  Eye, Down, 1.0e6f, Sun, Radiance, Ambient, 0.0f);
        std::printf("     from 400 km looking down: %u steps, transmittance %.3f\n",
                    FromOrbit.StepsTaken, FromOrbit.Transmittance);
        Expect(FromOrbit.StepsTaken > 0u, "the layer is still found from orbit (it is below, not absent)");
        Expect(FromOrbit.Transmittance < 0.99f, "and it actually occludes");
    }

    // ── ② one march, shared ────────────────────────────────────────────────────────────────────────────────────
    std::printf("\n2. one march over the union, not one per medium\n");
    {
        CloudLayerSettings Cloud{};
        Cloud.Enabled = true; Cloud.Base = 1000.0f; Cloud.Thickness = 800.0f; Cloud.Coverage = 0.7f;
        LocalVolumeSettings Fog{};
        Fog.Enabled = true;
        Fog.Centre[0] = 0.0f; Fog.Centre[1] = 900.0f; Fog.Centre[2] = 300.0f;
        Fog.HalfSize[0] = 400.0f; Fog.HalfSize[1] = 400.0f; Fog.HalfSize[2] = 200.0f;
        LocalVolumeSettings None{};

        const float Eye[3] = { 0.0f, 0.0f, 50.0f };
        float Dir[3] = { 0.0f, 0.85f, 0.53f };
        const float L = std::sqrt(Dir[0]*Dir[0] + Dir[1]*Dir[1] + Dir[2]*Dir[2]);
        for (int C = 0; C < 3; ++C) Dir[C] /= L;
        const float Sun[3] = { 0.0f, 0.5f, 0.87f };
        const float Radiance[3] = { 20.0f, 19.0f, 17.0f }, Ambient[3] = { 0.7f, 0.8f, 1.0f };

        const VolumetricSample CloudOnly = VolumetricMedia::March(Cloud, None, None, Wind, Budget,
                                              Eye, Dir, 1.0e5f, Sun, Radiance, Ambient, 0.0f);
        const VolumetricSample FogOnly   = VolumetricMedia::March(CloudLayerSettings{}, None, Fog, Wind, Budget,
                                              Eye, Dir, 1.0e5f, Sun, Radiance, Ambient, 0.0f);
        const VolumetricSample Both      = VolumetricMedia::March(Cloud, None, Fog, Wind, Budget,
                                              Eye, Dir, 1.0e5f, Sun, Radiance, Ambient, 0.0f);

        std::printf("     steps:           cloud %u, fog %u, both %u (the union spans the gap between them)\n",
                    CloudOnly.StepsTaken, FogOnly.StepsTaken, Both.StepsTaken);
        std::printf("     shadow marches:  cloud %u, fog %u, both %u\n",
                    CloudOnly.ShadowMarches, FogOnly.ShadowMarches, Both.ShadowMarches);
        // ⚠️ The saving is NOT fewer steps. The union of two volumes is genuinely longer than either, and with a
        //    bounded step size a longer span costs more steps — that is correct behaviour, not a regression.
        //    What one march buys is one sun-shadow march per occupied step instead of one per MEDIUM per step,
        //    so fog shadows cloud and cloud shadows fog for free. An earlier version of this proof asserted the
        //    step count and was simply measuring the wrong quantity.
        Expect(Both.ShadowMarches <= CloudOnly.ShadowMarches + FogOnly.ShadowMarches,
               "the shared sun-shadow march is not paid twice");

        std::printf("     transmittance: cloud %.4f, fog %.4f, both %.4f\n",
                    CloudOnly.Transmittance, FogOnly.Transmittance, Both.Transmittance);
        Expect(Both.Transmittance <= CloudOnly.Transmittance + 1e-4f &&
               Both.Transmittance <= FogOnly.Transmittance + 1e-4f,
               "two media occlude at least as much as either alone");
    }

    // ── ③ the media behave ─────────────────────────────────────────────────────────────────────────────────────
    std::printf("\n3. coverage and density do what they say\n");
    {
        const float P[3] = { 120.0f, 240.0f, 1600.0f };
        CloudLayerSettings Low{}, High{};
        Low.Enabled = High.Enabled = true;
        Low.Base = High.Base = 1500.0f; Low.Thickness = High.Thickness = 1000.0f;
        Low.Coverage = 0.2f; High.Coverage = 0.9f;
        uint32_t LowHits = 0u, HighHits = 0u;
        for (int I = 0; I < 400; ++I)
        {
            const float Q[3] = { P[0] + static_cast<float>(I) * 37.0f, P[1] + static_cast<float>(I) * 19.0f, P[2] };
            if (VolumetricMedia::CloudDensity(Low, Wind, Q, 0.0f, 0.0f) > 0.0f) ++LowHits;
            if (VolumetricMedia::CloudDensity(High, Wind, Q, 0.0f, 0.0f) > 0.0f) ++HighHits;
        }
        std::printf("     coverage 0.2 fills %u of 400 samples, coverage 0.9 fills %u\n", LowHits, HighHits);
        Expect(HighHits > LowHits, "more coverage fills more of the sky");

        // The height profile must vanish outside the slab and peak inside it.
        Expect(VolumetricMedia::HeightProfile(CloudTypeCategory::Cumulus, 0.0f, 0.5f) < 0.05f,
               "the profile is empty at the very base");
        Expect(VolumetricMedia::HeightProfile(CloudTypeCategory::Cumulus, 0.2f, 0.5f) > 0.5f,
               "and full-bodied a fifth of the way up (cumulus has a flat base)");
    }

    // ── ④ height fog is analytic ───────────────────────────────────────────────────────────────────────────────
    std::printf("\n4. height fog integrates in closed form\n");
    {
        FogSettings Fog{};
        Fog.HeightEnabled = true; Fog.HeightDensity = 0.02f; Fog.FalloffHeight = 400.0f;
        // Against a numerical integral of the same exponential profile.
        const float Start = 10.0f, End = 800.0f, Distance = 1000.0f;
        const float Closed = VolumetricMedia::HeightFogOpticalDepth(Fog, Start, End, Distance);
        double Numeric = 0.0;
        constexpr int kSteps = 20000;
        for (int I = 0; I < kSteps; ++I)
        {
            const float T = (static_cast<float>(I) + 0.5f) / static_cast<float>(kSteps);
            const float Z = Start + (End - Start) * T;
            Numeric += Fog.HeightDensity * std::exp(-Z / Fog.FalloffHeight) * (Distance / kSteps);
        }
        std::printf("     closed form %.6f against numerical %.6f\n", Closed, Numeric);
        Expect(std::fabs(Closed - Numeric) < 1e-3, "the closed form matches the integral");
    }

    // ── ⑤ the marker ───────────────────────────────────────────────────────────────────────────────────────────
    // A local volume has no surface, so the editor needs a proxy to select and drag. The properties that matter:
    // it holds a constant pixel size at any distance, it hides behind the camera, and a drag lands the volume
    // exactly under the pointer.
    std::printf("\n5. the volume marker can be found and dragged\n");
    {
        const float Eye[3] = { 0.0f, 0.0f, 100.0f };
        const float Forward[3] = { 0.0f, 1.0f, 0.0f };
        const float Right[3]   = { 1.0f, 0.0f, 0.0f };
        const float Up[3]      = { 0.0f, 0.0f, 1.0f };
        const uint32_t W = 1280u, H = 720u;
        const float Fov = 60.0f * 3.14159265358979323846f / 180.0f;

        // Constant screen size: the whole reason a marker exists is to be findable from far away.
        float Radius[3];
        int Index = 0;
        for (float Distance : { 100.0f, 1000.0f, 10000.0f })
        {
            const float World[3] = { 0.0f, Distance, 100.0f };
            const MarkerProjection P = VolumeMarkerProjection::Project(World, Eye, Forward, Right, Up, Fov, W, H);
            Radius[Index++] = P.Radius;
        }
        Expect(Radius[0] == Radius[1] && Radius[1] == Radius[2],
               "the marker holds its pixel size at 100 m, 1 km and 10 km");

        // Dead centre projects to the middle of the frame.
        const float Centre[3] = { 0.0f, 500.0f, 100.0f };
        const MarkerProjection Middle = VolumeMarkerProjection::Project(Centre, Eye, Forward, Right, Up, Fov, W, H);
        std::printf("     a marker straight ahead lands at (%.1f, %.1f) of %ux%u\n", Middle.X, Middle.Y, W, H);
        Expect(std::fabs(Middle.X - static_cast<float>(W) * 0.5f) < 0.5f &&
               std::fabs(Middle.Y - static_cast<float>(H) * 0.5f) < 0.5f,
               "a marker on the view axis lands in the centre of the frame");

        const float Behind[3] = { 0.0f, -500.0f, 100.0f };
        const MarkerProjection Back = VolumeMarkerProjection::Project(Behind, Eye, Forward, Right, Up, Fov, W, H);
        Expect(!Back.OnScreen, "a marker behind the camera does not draw");

        // Picking: the nearer of two overlapping markers wins.
        VolumeMarker Markers[2]{};
        Markers[0].World[0] = 0.0f; Markers[0].World[1] = 900.0f; Markers[0].World[2] = 100.0f;
        Markers[1].World[0] = 0.0f; Markers[1].World[1] = 300.0f; Markers[1].World[2] = 100.0f;
        const int32_t Picked = VolumeMarkerProjection::Pick(Markers, 2u, Eye, Forward, Right, Up, Fov, W, H,
                                                            static_cast<float>(W) * 0.5f,
                                                            static_cast<float>(H) * 0.5f);
        Expect(Picked == 1, "clicking two overlapping markers selects the nearer");

        // A drag must land the volume under the pointer, not merely near it.
        const float Start[3] = { 0.0f, 500.0f, 100.0f };
        float Moved[3];
        VolumeMarkerProjection::DragToPointer(Start, Eye, Forward, Right, Up, Fov, W, H, 900.0f, 200.0f, Moved);
        const MarkerProjection After = VolumeMarkerProjection::Project(Moved, Eye, Forward, Right, Up, Fov, W, H);
        std::printf("     dragged to pointer (900, 200), marker now projects to (%.1f, %.1f)\n", After.X, After.Y);
        Expect(std::fabs(After.X - 900.0f) < 0.5f && std::fabs(After.Y - 200.0f) < 0.5f,
               "the dragged volume lands exactly under the pointer");

        // The drag plane keeps the volume at its original depth rather than pulling it toward the camera.
        const float DepthBefore = VolumeMarkerProjection::Project(Start, Eye, Forward, Right, Up, Fov, W, H).Depth;
        Expect(std::fabs(After.Depth - DepthBefore) < 0.5f, "and stays at the depth it started at");

        Expect(VolumeMarkerProjection::GlyphPath(VolumeMarkerCategory::LocalCloud) != nullptr &&
               VolumeMarkerProjection::GlyphPath(VolumeMarkerCategory::LocalFog) != nullptr,
               "every marker category has an SVG glyph");
    }

    // ── ⑥ clouds cast their own shafts ────────────────────────────────────────────────────────────────────────
    // Cloud shafts are not a feature bolted onto the march — they are what lights a cloud at all. ShadowMarch
    // accumulates cloud density along the sun ray, so broken cumulus shadows itself and beams appear in any haze
    // beneath it with nothing extra asked for.
    //
    // The scene-occlusion path that used to sit above this section (a callback for shafts cut by buildings or
    // terrain) was removed: nothing in the engine called it and no such geometry exists yet. This section is
    // what remains, and it is the case that actually renders.
    std::printf("\n6. broken cloud casts shafts into haze — the medium shadows itself\n");
    {
        CloudLayerSettings Broken{};
        Broken.Enabled = true; Broken.Type = CloudTypeCategory::Cumulus;
        Broken.Base = 800.0f; Broken.Thickness = 600.0f;
        Broken.Coverage = 0.50f; Broken.Density = 2.4f; Broken.Scale = 0.35f;

        LocalVolumeSettings Air{};
        Air.Enabled = true;
        Air.Centre[0] = 0.0f; Air.Centre[1] = 0.0f; Air.Centre[2] = 300.0f;
        Air.HalfSize[0] = 3000.0f; Air.HalfSize[1] = 3000.0f; Air.HalfSize[2] = 300.0f;
        Air.Density = 0.22f; Air.Coverage = 0.95f; Air.Scale = 1500.0f; Air.Anisotropy = 0.76f;
        LocalVolumeSettings Nothing{};

        float SunUp[3] = { -0.42f, 0.10f, 0.90f };
        const float SL = std::sqrt(SunUp[0]*SunUp[0] + SunUp[1]*SunUp[1] + SunUp[2]*SunUp[2]);
        for (int C = 0; C < 3; ++C) SunUp[C] /= SL;
        const float Bright[3] = { 60.0f, 58.0f, 54.0f }, Fill[3] = { 0.35f, 0.45f, 0.62f };

        VolumetricBudget CloudOnly = Budget;
        CloudOnly.CloudSteps = 48u; CloudOnly.LocalSteps = 48u; CloudOnly.LightTaps = 5u;

        double Lowest = 1e30, Highest = -1e30;
        for (int I = 0; I < 41; ++I)
        {
            const float X = -1000.0f + static_cast<float>(I) * 50.0f;
            const float Eye[3] = { X, 0.0f, 120.0f };
            float Ray[3] = { 0.0f, 0.15f, 0.99f };
            const float RL = std::sqrt(Ray[0]*Ray[0] + Ray[1]*Ray[1] + Ray[2]*Ray[2]);
            for (int C = 0; C < 3; ++C) Ray[C] /= RL;
            const VolumetricSample Sample = VolumetricMedia::March(
                Broken, Air, Nothing, Wind, CloudOnly, Eye, Ray, 6000.0f,
                SunUp, Bright, Fill, 0.0f);
            const double Energy = Sample.Scatter[0] + Sample.Scatter[1] + Sample.Scatter[2];
            Lowest = std::fmin(Lowest, Energy); Highest = std::fmax(Highest, Energy);
        }
        std::printf("     in-scatter across 2 km of broken cloud: %.3f .. %.3f (%.2fx)\n",
                    Lowest, Highest, Highest / std::fmax(Lowest, 1e-9));
        Expect(Highest > Lowest * 2.0,
               "cloud gaps and cloud shadow differ strongly, so the beams are there");

        // Overcast must NOT produce the same structure: no gaps, no beams. This is what separates a shaft from
        //    ordinary brightness variation in the noise.
        CloudLayerSettings Solid = Broken;
        Solid.Coverage = 1.0f;
        double SolidLow = 1e30, SolidHigh = -1e30;
        for (int I = 0; I < 41; ++I)
        {
            const float X = -1000.0f + static_cast<float>(I) * 50.0f;
            const float Eye[3] = { X, 0.0f, 120.0f };
            float Ray[3] = { 0.0f, 0.15f, 0.99f };
            const float RL = std::sqrt(Ray[0]*Ray[0] + Ray[1]*Ray[1] + Ray[2]*Ray[2]);
            for (int C = 0; C < 3; ++C) Ray[C] /= RL;
            const VolumetricSample Sample = VolumetricMedia::March(
                Solid, Air, Nothing, Wind, CloudOnly, Eye, Ray, 6000.0f, SunUp, Bright, Fill, 0.0f);
            const double Energy = Sample.Scatter[0] + Sample.Scatter[1] + Sample.Scatter[2];
            SolidLow = std::fmin(SolidLow, Energy); SolidHigh = std::fmax(SolidHigh, Energy);
        }
        std::printf("     the same sweep under solid overcast:    %.3f .. %.3f (%.2fx)\n",
                    SolidLow, SolidHigh, SolidHigh / std::fmax(SolidLow, 1e-9));
        Expect((Highest / std::fmax(Lowest, 1e-9)) > (SolidHigh / std::fmax(SolidLow, 1e-9)),
               "broken cloud beams more strongly than overcast — the gaps are what make shafts");
    }

    // ── ⑦ the tier ladder actually reaches the march ───────────────────────────────────────────────────────────
    // The budgets were seated in FidelityClassifier during step 0 and it is easy for them to stay decorative.
    // This walks the five tiers, builds the budget the way a caller must, and checks the march responds.
    std::printf("\n7. the tier ladder drives the march\n");
    {
        FidelityClassifier Classifier;
        const FidelityCategory Tiers[5] = { FidelityCategory::MinimalFidelity, FidelityCategory::EconomyFidelity,
                                            FidelityCategory::StandardFidelity, FidelityCategory::UltraFidelity,
                                            FidelityCategory::ReferenceFidelity };
        const char* Names[5] = { "Minimal", "Economy", "Standard", "Ultra", "Reference" };

        LocalVolumeSettings Haze{};
        Haze.Enabled = true;
        Haze.Centre[0] = 0.0f; Haze.Centre[1] = 120.0f; Haze.Centre[2] = 60.0f;
        Haze.HalfSize[0] = 200.0f; Haze.HalfSize[1] = 80.0f; Haze.HalfSize[2] = 60.0f;
        Haze.Density = 1.0f; Haze.Coverage = 0.95f; Haze.Scale = 500.0f;
        LocalVolumeSettings None{};
        CloudLayerSettings NoCloud{};

        const float Eye[3] = { 0.0f, 0.0f, 40.0f };
        float Direction[3] = { 0.05f, 0.94f, 0.34f };
        const float DL = std::sqrt(Direction[0]*Direction[0] + Direction[1]*Direction[1] + Direction[2]*Direction[2]);
        for (int C = 0; C < 3; ++C) Direction[C] /= DL;
        const float Sun[3] = { 0.0f, 0.20f, 0.98f };
        const float Radiance[3] = { 30.0f, 29.0f, 27.0f }, Ambient[3] = { 0.4f, 0.5f, 0.7f };

        std::printf("     %-11s %7s %7s %7s %7s\n", "tier", "cloud", "local", "taps", "atmN");
        uint32_t Previous = 0u;
        bool Rising = true, MinimalFree = false;
        for (int T = 0; T < 5; ++T)
        {
            const FidelityCriteria Criteria = Classifier.ConstructCriteria(Tiers[T]);
            VolumetricBudget Budgeted{};
            Budgeted.CloudSteps    = Criteria.CloudMarchStepCount;
            Budgeted.LocalSteps    = Criteria.LocalVolumeStepCount;
            Budgeted.LightTaps     = Criteria.CloudLightTapCount;
            Budgeted.CoverageMargin= Criteria.CloudCoverageMargin;

            const VolumetricSample Sample = VolumetricMedia::March(
                NoCloud, Haze, None, Wind, Budgeted, Eye, Direction, 1000.0f,
                Sun, Radiance, Ambient, 0.0f);

            std::printf("     %-11s %7u %7u %7u %7u\n", Names[T],
                        Criteria.CloudMarchStepCount, Criteria.LocalVolumeStepCount,
                        Criteria.CloudLightTapCount, Criteria.AtmosphereSampleCount);

            if (T == 0) MinimalFree = Sample.StepsTaken > 0u;
            if (T > 0 && Sample.StepsTaken < Previous) Rising = false;
            Previous = Sample.StepsTaken;
        }
        Expect(MinimalFree, "even Minimal marches the medium");
        Expect(Rising, "higher tiers march it more finely");
    }

    // ── ⑧ the jitter dithers but never wanders ─────────────────────────────────────────────────────────────────
    // P2.1: the layer march jitters its start per ray (MarchJitter: hash13 over the spread direction plus
    // fract(Time*3)), so adjacent rays sample different phases instead of contouring into bands. The same ray
    // twice is bit-identical (deterministic — proofs and stills are stable); neighbouring rays and later
    // clocks sample different phases (the dither dithers). The anti-banding evidence itself lives in the
    // kernel proof's streak gauge, which renders the jittered field; this pins the mechanism.
    std::printf("\n8. the march jitter dithers without wandering\n");
    {
        CloudLayerSettings Layer{};
        Layer.Enabled = true; Layer.Base = 1000.0f; Layer.Thickness = 800.0f;
        Layer.Coverage = 0.6f; Layer.Density = 1.5f;
        LocalVolumeSettings None{};
        const float Eye[3] = { 0.0f, 0.0f, 50.0f };
        float Ray[3] = { 0.0f, 0.5f, 0.87f };
        const float RL = std::sqrt(Ray[0]*Ray[0] + Ray[1]*Ray[1] + Ray[2]*Ray[2]);
        for (int C = 0; C < 3; ++C) Ray[C] /= RL;
        const float Sun[3] = { 0.0f, 0.5f, 0.87f };
        const float Radiance[3] = { 20.0f, 19.0f, 17.0f }, Ambient[3] = { 0.7f, 0.8f, 1.0f };

        const VolumetricSample First = VolumetricMedia::March(
            Layer, None, None, Wind, Budget, Eye, Ray, 1.0e5f, Sun, Radiance, Ambient, 0.0f);
        const VolumetricSample Second = VolumetricMedia::March(
            Layer, None, None, Wind, Budget, Eye, Ray, 1.0e5f, Sun, Radiance, Ambient, 0.0f);
        Expect(First.Transmittance == Second.Transmittance && First.Scatter[0] == Second.Scatter[0] &&
               First.Scatter[1] == Second.Scatter[1] && First.Scatter[2] == Second.Scatter[2] &&
               First.StepsTaken == Second.StepsTaken,
               "the same ray twice is bit-identical");
        Expect(First.StepsTaken > 0u && First.Transmittance < 1.0f,
               "the probe ray actually meets cloud (or the asserts below are vacuous)");

        // A 4x4 fan of neighbouring rays, half a degree apart: identical transmittances across the whole
        // fan would mean the per-ray phase collapsed to a constant.
        bool Varied = false;
        float Previous = First.Transmittance;
        for (int I = 0; I < 16; ++I)
        {
            float Fan[3] = { (static_cast<float>(I % 4) - 1.5f) * 0.009f, 0.5f, 0.87f };
            const float FL = std::sqrt(Fan[0]*Fan[0] + Fan[1]*Fan[1] + Fan[2]*Fan[2]);
            for (int C = 0; C < 3; ++C) Fan[C] /= FL;
            const VolumetricSample FanSample = VolumetricMedia::March(
                Layer, None, None, Wind, Budget, Eye, Fan, 1.0e5f, Sun, Radiance, Ambient, 0.0f);
            if (FanSample.Transmittance != Previous) Varied = true;
            Previous = FanSample.Transmittance;
        }
        Expect(Varied, "neighbouring rays sample different phases");

        // The same ray a tenth of a second later re-rolls the dither (fract 0.0 -> 0.3): the clock term is
        // live, so the dither animates instead of baking a fixed pattern into the sky.
        const VolumetricSample Later = VolumetricMedia::March(
            Layer, None, None, Wind, Budget, Eye, Ray, 1.0e5f, Sun, Radiance, Ambient, 0.1f);
        Expect(Later.Transmittance != First.Transmittance,
               "a later clock re-rolls the phase");
    }

    std::printf("\n9. the layer march stops at the far cap\n");
    {
        // The cap law itself: below or inside, thick x 14; above, max(60 km, thick x 40). Exact floats —
        // the law is one multiply, so a transcription slip has nowhere to hide.
        Expect(VolumetricMedia::SlabFarCap(100.0f, 1500.0f, 2400.0f) == 12600.0f,
               "below the slab the cap is thick x 14");
        Expect(VolumetricMedia::SlabFarCap(2000.0f, 1500.0f, 2400.0f) == 12600.0f,
               "inside the slab the cap is still thick x 14");
        Expect(VolumetricMedia::SlabFarCap(3000.0f, 1500.0f, 2400.0f) == 60000.0f,
               "above a thin slab the 60 km floor wins");
        Expect(VolumetricMedia::SlabFarCap(5000.0f, 1500.0f, 3500.0f) == 80000.0f,
               "above a thick slab thick x 40 wins");

        CloudLayerSettings Layer{};
        Layer.Enabled = true; Layer.Base = 1500.0f; Layer.Thickness = 900.0f;
        // Optically thin on purpose: the count asserts need every step taken, and the march breaks at
        // T < 0.005. At density 0.02 even 89 peak samples total OD 2.52 (T = 0.08), so no early-out can
        // fire whatever the field holds — the counts below are geometry, not weather.
        Layer.Coverage = 0.6f; Layer.Density = 0.02f;
        LocalVolumeSettings None{};
        const float Sun[3] = { 0.0f, 0.5f, 0.87f };
        const float Radiance[3] = { 20.0f, 19.0f, 17.0f }, Ambient[3] = { 0.7f, 0.8f, 1.0f };

        // A grazing ray from below: 90 km of chord, cut to 12.6 km. At the tier step (4000/28 m) the cut
        // span takes 89 steps; an uncut chord would saturate the 112-step count cap instead.
        const float Eye[3] = { 0.0f, 0.0f, 100.0f };
        float Graze[3] = { 1.0f, 0.0f, 0.01f };
        const float GL = std::sqrt(Graze[0]*Graze[0] + Graze[2]*Graze[2]);
        Graze[0] /= GL; Graze[2] /= GL;
        const VolumetricSample Cut = VolumetricMedia::March(
            Layer, None, None, Wind, Budget, Eye, Graze, 200000.0f, Sun, Radiance, Ambient, 0.0f);
        Expect(Cut.StepsTaken == 89u,
               "a grazing ray marches the cut span, not the count cap (89 steps, not 112)");

        // The cap is a cut, not a fade: marching with the maximum already at the cut shades bit-identical
        // light, so nothing beyond the cap contributed.
        const float Entry = (1500.0f - 100.0f) / Graze[2];
        const VolumetricSample Short = VolumetricMedia::March(
            Layer, None, None, Wind, Budget, Eye, Graze, Entry + 12600.0f, Sun, Radiance, Ambient, 0.0f);
        Expect(Short.Transmittance == Cut.Transmittance && Short.Scatter[0] == Cut.Scatter[0] &&
               Short.Scatter[1] == Cut.Scatter[1] && Short.Scatter[2] == Cut.Scatter[2] &&
               Short.StepsTaken == Cut.StepsTaken,
               "a maximum at the cut shades bit-identical to 200 km");

        // A steep ray never reaches the cap: 900 m of chord at 4000/28 m steps is 7 steps, cap or no cap.
        const float Up[3] = { 0.0f, 0.0f, 1.0f };
        const VolumetricSample Steep = VolumetricMedia::March(
            Layer, None, None, Wind, Budget, Eye, Up, 200000.0f, Sun, Radiance, Ambient, 0.0f);
        Expect(Steep.StepsTaken == 7u,
               "a steep ray keeps its 7 steps (short spans are untouched)");
    }

    std::printf("\n10. the densities erode, lean and swirl like the reference\n");
    {
        // The ported layer profiles: altostratus peaks 0.7 mid-slab, cirrus 0.35 — exact on the plateau,
        // banded on the slopes.
        Expect(VolumetricMedia::HeightProfile(CloudTypeCategory::Altostratus, 0.45f, 0.3f) == 0.7f,
               "altostratus peaks at 0.7");
        Expect(VolumetricMedia::HeightProfile(CloudTypeCategory::Cirrus, 0.45f, 0.3f) == 0.35f,
               "cirrus peaks at 0.35");
        const float AltoEdge = VolumetricMedia::HeightProfile(CloudTypeCategory::Altostratus, 0.1f, 0.3f);
        Expect(AltoEdge > 0.1f && AltoEdge < 0.3f, "altostratus rises through its lower edge");
        const float CirrusEdge = VolumetricMedia::HeightProfile(CloudTypeCategory::Cirrus, 0.8f, 0.3f);
        Expect(CirrusEdge > 0.05f && CirrusEdge < 0.2f, "cirrus falls through its upper edge");

        // The local profiles and mask, direct: stratiform peaks 1.0, wispy 0.6, cumuliform between 1.0 and
        // 1.1; the ellipsoid clips its corners to exactly 0 while the box fades them to ~0.104.
        Expect(VolumetricMedia::LocalHeightProfile(LocalCloudType::Stratiform, 0.5f) == 1.0f,
               "stratiform peaks at 1.0");
        Expect(VolumetricMedia::LocalHeightProfile(LocalCloudType::Wispy, 0.45f) == 0.6f,
               "wispy peaks at 0.6");
        const float CuProf = VolumetricMedia::LocalHeightProfile(LocalCloudType::Cumuliform, 0.5f);
        Expect(CuProf > 1.0f && CuProf < 1.1f, "cumuliform cores above 1.0");
        const float Centre[3] = { 0.0f, 0.0f, 0.0f }, Corner[3] = { 0.9f, 0.9f, 0.9f };
        Expect(VolumetricMedia::LocalCloudMask(LocalCloudShape::Ellipsoid, 0.5f, Centre) == 1.0f,
               "the ellipsoid is solid at its centre");
        Expect(VolumetricMedia::LocalCloudMask(LocalCloudShape::Ellipsoid, 0.5f, Corner) == 0.0f,
               "the ellipsoid clips its corners");
        const float BoxCorner = VolumetricMedia::LocalCloudMask(LocalCloudShape::Box, 0.5f, Corner);
        Expect(BoxCorner > 0.09f && BoxCorner < 0.12f, "the box fades its corners instead");

        CloudLayerSettings High{};
        High.Enabled = true; High.Base = 1500.0f; High.Thickness = 1000.0f;
        High.Coverage = 0.9f; High.Density = 1.0f;

        // Erosion carves, never builds: lod 0 sits at or under lod 1 everywhere on the transect, and
        // strictly under somewhere (at hn 0.1 the mix weight cannot vanish, so some carve is guaranteed
        // wherever the body is strictly inside (0, 1)).
        uint32_t Strict = 0u;
        bool Carves = true;
        for (int I = 0; I < 8; ++I)
        {
            const float Q[3] = { 120.0f + static_cast<float>(I) * 37.0f,
                                 240.0f + static_cast<float>(I) * 19.0f, 1600.0f };
            const float Carved = VolumetricMedia::CloudDensity(High, Wind, Q, 0.0f, 0.0f);
            const float Whole = VolumetricMedia::CloudDensity(High, Wind, Q, 0.0f, 1.0f);
            if (Carved > Whole) Carves = false;
            if (Carved < Whole) ++Strict;
        }
        std::printf("     erosion carves at %u of 8 transect points\n", Strict);
        Expect(Carves, "the eroded density never exceeds the uneroded");
        Expect(Strict > 0u, "and it carves strictly somewhere");

        // The lod gate opens past 0.5: two lods above it shade bit-identical uneroded light.
        const float P[3] = { 120.0f, 240.0f, 1600.0f };
        Expect(VolumetricMedia::CloudDensity(High, Wind, P, 0.0f, 0.6f) ==
               VolumetricMedia::CloudDensity(High, Wind, P, 0.0f, 1.0f),
               "lod 0.6 and lod 1.0 agree bit-for-bit (both skip erosion)");

        // The lean is a rigid downwind shift: the field at P under a +x integral equals the rest field at
        // P + drift + lean, where the drift comes from the trusted AdvectDrift and the lean direction (+x)
        // is hand-derived from the integral's sign — a missing or flipped lean misses by metres, not ulps.
        WindSettings WindI = Wind;
        WindI.Integral[0] = 1000.0f; WindI.Integral[1] = 0.0f;
        float DriftI[2];
        WindField::AdvectDrift(WindI, 1600.0f, 0.8f, DriftI);
        const float HnI = (1600.0f - 1500.0f) / (2500.0f - 1500.0f);
        const float LeanI = HnI * 1000.0f * 0.35f * 0.2f;
        const float Shifted[3] = { P[0] + DriftI[0] + LeanI, P[1] + DriftI[1], P[2] };
        const float Leaned = VolumetricMedia::CloudDensity(High, WindI, P, 0.0f, 0.0f);
        const float Rest = VolumetricMedia::CloudDensity(High, Wind, Shifted, 0.0f, 0.0f);
        std::printf("     lean rigid-shift difference: %.3e\n", std::fabs(Leaned - Rest));
        Expect(std::fabs(Leaned - Rest) < 1e-4f,
               "drift + lean shift the field rigidly (a missing lean misses by metres)");

        // The swirl stirs the sample, not the profile: uneroded (lod 1) local densities at swirl-shifted
        // points agree once each side's own profile x mask is divided out. Zero integral, so the drift is
        // exactly 0 and the shift is pure swirl.
        LocalVolumeSettings Puff{};
        Puff.Enabled = true;
        Puff.Centre[0] = 0.0f; Puff.Centre[1] = 0.0f; Puff.Centre[2] = 400.0f;
        Puff.HalfSize[0] = 200.0f; Puff.HalfSize[1] = 200.0f; Puff.HalfSize[2] = 100.0f;
        Puff.Density = 1.0f; Puff.Coverage = 0.6f; Puff.Scale = 60.0f;
        const float SwA[3] = { 10.0f, -6.0f, 4.0f }, SwB[3] = { 0.0f, 0.0f, 0.0f };
        const float P1[3] = { 10.0f, 20.0f, 405.0f };
        const float P2[3] = { P1[0] + SwA[0] * 0.6f, P1[1] + SwA[1] * 0.6f, P1[2] + SwA[2] * 0.6f };
        const float D1 = VolumetricMedia::LocalDensity(Puff, Wind, P1, SwA, 1.0f, false);
        const float D2 = VolumetricMedia::LocalDensity(Puff, Wind, P2, SwB, 1.0f, false);
        const float L1[3] = { (P1[0] - Puff.Centre[0]) / Puff.HalfSize[0],
                              (P1[1] - Puff.Centre[1]) / Puff.HalfSize[1],
                              (P1[2] - Puff.Centre[2]) / Puff.HalfSize[2] };
        const float L2[3] = { (P2[0] - Puff.Centre[0]) / Puff.HalfSize[0],
                              (P2[1] - Puff.Centre[1]) / Puff.HalfSize[1],
                              (P2[2] - Puff.Centre[2]) / Puff.HalfSize[2] };
        const float W1 = VolumetricMedia::LocalHeightProfile(Puff.Type, L1[2] * 0.5f + 0.5f)
                       * VolumetricMedia::LocalCloudMask(Puff.Shape, Puff.Soft, L1);
        const float W2 = VolumetricMedia::LocalHeightProfile(Puff.Type, L2[2] * 0.5f + 0.5f)
                       * VolumetricMedia::LocalCloudMask(Puff.Shape, Puff.Soft, L2);
        std::printf("     swirl rigid-shift difference: %.3e\n", std::fabs(D1 / W1 - D2 / W2));
        Expect(W1 > 0.0f && W2 > 0.0f, "both swirl probes sit inside the body (or the ratio is vacuous)");
        Expect(std::fabs(D1 / W1 - D2 / W2) < 1e-6f,
               "the swirl shifts the sample rigidly (a dropped swirl misses by a tenth of a cell)");

        // Unlinked is static — today's contract, pinned until P8 ports the reference's unlinked drift: the
        // integral moves nothing, and a stray swirl cannot move the box either.
        CloudLayerSettings Free = High;
        Free.FollowWind = false;
        Expect(VolumetricMedia::CloudDensity(Free, WindI, P, 0.0f, 0.0f) ==
               VolumetricMedia::CloudDensity(Free, Wind, P, 0.0f, 0.0f),
               "unlinked, the integral leaves the slab bit-identical");
        LocalVolumeSettings Anchored = Puff;
        Anchored.FollowWind = false;
        Expect(VolumetricMedia::LocalDensity(Anchored, Wind, P1, SwA, 0.0f, false) ==
               VolumetricMedia::LocalDensity(Anchored, Wind, P1, SwB, 0.0f, false),
               "unlinked, a stray swirl leaves the box bit-identical");
    }

    std::printf("\n");
    for (int I = 0; I < 108; ++I) std::putchar('=');
    std::printf("\n%s\n\n", Failures == 0 ? "  the media behave" : "  THE MEDIA DO NOT BEHAVE");
    return Failures == 0 ? 0 : 1;
}
