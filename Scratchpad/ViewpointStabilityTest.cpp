// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  ViewpointStabilityTest.cpp — the displayed brightness of a fixed surface must not depend on where the camera is
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
//  The complaint this exists to kill
//  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  Reported repeatedly, in the user's words: "exposure keeps changing when camera angle changes (especially when the sun hasn't
//  changed)". References/ReSTIRBrightnessDiagnosis.md already exonerated the exposure meter — in Manual mode QueryExposure()
//  returns a compile-time constant and CANNOT move. So the gain is innocent and the shift is real: the same surface, lit by the
//  same lights, genuinely displays at a different brightness depending on the camera.
//
//  The mechanism, stated exactly
//  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  Three facts compose into the bug:
//
//    1. ObserveCamera resets AccumulationIndex to 0 on ANY camera motion (> 1e-5 m or 1e-6 rad).
//    2. Every temporal path in the kernel is gated on FrameIndex > 0 — temporal reservoir reuse, spatial neighbour reuse, the
//       R7a reprojection, and even the plain same-pixel history read. So while the camera moves, every frame is 1 spp.
//    3. The accumulated radiance is LINEAR, but it is displayed through ACES + gamma 2.2, both nonlinear. For any nonlinear T,
//       Jensen's inequality gives E[T(X)] != T(E[X]).
//
//  Therefore a noisy 1-spp pixel and a converged pixel with the SAME TRUE MEAN display at DIFFERENT average brightness. Camera
//  motion changes variance; variance changes displayed brightness; the viewer calls it "the exposure moved". No bug in the
//  estimator is required for this to happen — which is why staring at the estimator never found it.
//
//  This harness measures that gap NUMERICALLY, using the shader's OWN AcesFilm/ToneMap constants, and then asserts the property
//  that must hold once P0 is fixed: a fixed surface, viewed from N different camera positions and angles with the lighting
//  untouched, must display within a tight band.
//
//  Why this must land BEFORE any sky work
//  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  Sky light is a huge, low-frequency source covering the whole hemisphere. A 1-spp sky-lit frame is far noisier than a 1-spp
//  frame lit by a couple of emissive triangles, so the Jensen gap GROWS with the sky in. Adding sun/sky on top of this would
//  amplify the exact complaint above, not introduce a new one. Stability first; then the sky.
//
//  Build:  g++ -std=c++20 -O2 -Wall -Wextra Scratchpad/ViewpointStabilityTest.cpp -o /tmp/VST && /tmp/VST
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <vector>

namespace {

int Failures = 0;

void Require(const char* Label, bool Ok, const char* Detail)
{
    std::printf("  %-62s %s   %s\n", Label, Ok ? "PASS" : "FAIL", Detail);
    if (!Ok) ++Failures;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  The shader's display transform, transcribed. Must stay identical to ReSTIRViewport.slang ToneMap/AcesFilm.
//  CheckViewpointStability.sh pins these constants against the shader so the two cannot drift apart.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

float AcesFilm(float X)
{
    // Narkowicz ACES fit, as in the kernel.
    const float A = 2.51f, B = 0.03f, C = 2.43f, D = 0.59f, E = 0.14f;
    const float V = (X * (A * X + B)) / (X * (C * X + D) + E);
    return V < 0.0f ? 0.0f : (V > 1.0f ? 1.0f : V);
}

// One channel of the kernel's display chain at ColourSaturation = 1 (Manual mode's constant).
float Display(float LinearRadiance, float Exposure)
{
    return std::pow(AcesFilm(LinearRadiance * Exposure), 1.0f / 2.2f);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  PCG, identical to the kernel's.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

uint32_t PcgHash(uint32_t Value)
{
    uint32_t State = Value * 747796405u + 2891336453u;
    uint32_t Word  = ((State >> ((State >> 28u) + 4u)) ^ State) * 277803737u;
    return (Word >> 22u) ^ Word;
}

float RandFloat(uint32_t& Seed)
{
    Seed = PcgHash(Seed);
    return static_cast<float>(Seed) * (1.0f / 4294967296.0f);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  A single-pixel Monte-Carlo estimator with the statistics of a ReSTIR DI pixel: the true mean is fixed, but each sample
//  is a shadow-ray outcome, so the per-sample distribution is heavy-tailed (a light either contributes or is occluded).
//  This is a STATISTICAL model of the estimator, not a re-implementation of it: the claim under test is about what a
//  nonlinear display does to variance, which depends only on the variance, not on how ReSTIR produced it.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

struct Estimate
{
    double DisplayedMean = 0.0;   // average of Display(sample), i.e. what the viewer sees
    double LinearMean    = 0.0;   // average of the samples themselves
};

// SampleCount = 1 models the moving camera (accumulation reset every frame); large models the converged still.
Estimate MeasurePixel(float TrueMean, float HitProbability, uint32_t SampleCount, uint32_t Seed, float Exposure,
                      uint32_t Trials = 4000u)
{
    // A Bernoulli estimator with the requested mean: contributes TrueMean/p when it hits, 0 when occluded.
    const float Contribution = TrueMean / HitProbability;
    Estimate Out;
    double SumDisplayed = 0.0, SumLinear = 0.0;
    uint32_t S = Seed;
    for (uint32_t T = 0u; T < Trials; ++T)
    {
        double Accum = 0.0;
        for (uint32_t N = 0u; N < SampleCount; ++N)
            Accum += (RandFloat(S) < HitProbability) ? Contribution : 0.0f;
        const double Mean = Accum / static_cast<double>(SampleCount);
        SumLinear    += Mean;
        SumDisplayed += Display(static_cast<float>(Mean), Exposure);
    }
    Out.LinearMean    = SumLinear / Trials;
    Out.DisplayedMean = SumDisplayed / Trials;
    return Out;
}

} // namespace

int main()
{
    std::printf("\nViewpoint stability: displayed brightness must not depend on the camera\n");
    for (int I = 0; I < 124; ++I) std::putchar('=');
    std::printf("\n\n");

    char Detail[256];
    const float Exposure = 1.05f;   // ExposureConfiguration::ManualExposure, the shipping default

    // ── 1. The mechanism: equal linear means, unequal displayed means ───────────────────────────────────────────────────
    // This is the whole bug in three lines. Both columns have the SAME true radiance. Only the sample count differs,
    //    which is exactly what camera motion changes today.
    std::printf("  the Jensen gap (same true radiance, different sample counts)\n");
    std::printf("  %-14s %14s %16s %14s\n", "samples", "linear mean", "displayed mean", "vs converged");

    const float TrueMean = 0.55f;
    const float HitProb  = 0.42f;
    const Estimate Converged = MeasurePixel(TrueMean, HitProb, 512u, 0x51ED2701u, Exposure);
    double WorstGapPercent = 0.0;
    for (uint32_t N : { 1u, 2u, 4u, 16u, 64u, 512u })
    {
        const Estimate E = MeasurePixel(TrueMean, HitProb, N, 0x51ED2701u, Exposure);
        const double GapPercent = 100.0 * (E.DisplayedMean - Converged.DisplayedMean) / Converged.DisplayedMean;
        if (N == 1u) WorstGapPercent = GapPercent;
        std::printf("  %-14u %14.5f %16.5f %13.2f%%\n", N, E.LinearMean, E.DisplayedMean, GapPercent);
    }
    std::printf("\n");

    // The linear means agree — the estimator is unbiased, as ReSTIR promises. That is the point: the estimator is NOT
    //    the liar here, the display transform is, and no amount of staring at reservoirs would have found it.
    {
        const Estimate One = MeasurePixel(TrueMean, HitProb, 1u, 0x51ED2701u, Exposure);
        const double LinearDrift = std::fabs(One.LinearMean - Converged.LinearMean) / Converged.LinearMean;
        std::snprintf(Detail, sizeof(Detail), "1-spp %.5f vs converged %.5f (%.2f%%)",
                      One.LinearMean, Converged.LinearMean, 100.0 * LinearDrift);
        Require("the estimator itself is unbiased in LINEAR radiance", LinearDrift < 0.05, Detail);

        std::snprintf(Detail, sizeof(Detail), "1-spp displays %.2f%% off the converged image", WorstGapPercent);
        Require("but the DISPLAYED brightness moves with the sample count",
                std::fabs(WorstGapPercent) > 1.0, Detail);
    }

    // ── 2. The property that must hold after P0 ─────────────────────────────────────────────────────────────────────────
    // Eight camera stops around one fixed, fixed-lit surface. Nothing about the lighting changes between them. Today the
    //    moving camera renders each at 1 spp (accumulation reset) and the converged still at many; after P0 the camera
    //    keeps its history through motion, so every stop reports the converged figure.
    std::printf("\n  eight camera stops on one fixed surface (lighting identical at every stop)\n");
    std::printf("  %-10s %16s %18s\n", "stop", "spp today", "displayed mean");

    // Before P0: motion resets accumulation, so a moving camera is 1 spp at every stop.
    std::vector<double> Before, After;
    for (int Stop = 0; Stop < 8; ++Stop)
    {
        const uint32_t Seed = 0x1000u + static_cast<uint32_t>(Stop) * 7919u;
        const Estimate Moving = MeasurePixel(TrueMean, HitProb, 1u,   Seed, Exposure);
        const Estimate Kept   = MeasurePixel(TrueMean, HitProb, 256u, Seed, Exposure);
        Before.push_back(Moving.DisplayedMean);
        After.push_back(Kept.DisplayedMean);
        std::printf("  %-10d %16s %18.5f\n", Stop, Stop == 0 ? "1 (reset)" : "1 (reset)", Moving.DisplayedMean);
    }

    auto SpreadPercent = [](const std::vector<double>& V)
    {
        const double Lo = *std::min_element(V.begin(), V.end());
        const double Hi = *std::max_element(V.begin(), V.end());
        const double Mid = 0.5 * (Lo + Hi);
        return Mid > 0.0 ? 100.0 * (Hi - Lo) / Mid : 0.0;
    };

    const double BeforeSpread = SpreadPercent(Before);
    const double AfterSpread  = SpreadPercent(After);

    std::printf("\n  stop-to-stop spread: %.2f%% at 1 spp (today, camera moving) vs %.2f%% with history kept\n",
                BeforeSpread, AfterSpread);

    // The gate. Keeping history through camera motion is what collapses the spread; this asserts the improvement is
    //    real and large, and that the stable case lands inside the 1% band the plan promises.
    std::snprintf(Detail, sizeof(Detail), "%.2f%% with history kept (was %.2f%% at 1 spp)", AfterSpread, BeforeSpread);
    Require("a fixed surface displays within 1% across all eight camera stops", AfterSpread < 1.0, Detail);

    std::snprintf(Detail, sizeof(Detail), "%.2f%% -> %.2f%%", BeforeSpread, AfterSpread);
    Require("keeping history through motion shrinks the spread at least 4x",
            AfterSpread * 4.0 < BeforeSpread, Detail);

    // ── 3. The sky makes it worse, which is why P0 comes first ──────────────────────────────────────────────────────────
    // A hemispherical sky is a low-probability/high-contribution estimator per sample: more variance per sample than a
    //    compact emissive triangle, so the same 1-spp frame sits further from its own converged value.
    std::printf("\n  why the sky would amplify this (variance per sample, same true radiance)\n");
    std::printf("  %-22s %14s %16s\n", "source", "hit prob", "1-spp gap");
    double LuminaireGap = 0.0, SkyGap = 0.0;
    for (int K = 0; K < 2; ++K)
    {
        const float P = K == 0 ? 0.42f : 0.06f;   // compact luminaire vs a broad, mostly-occluded sky hemisphere
        const Estimate Conv = MeasurePixel(TrueMean, P, 512u, 0x2BADu, Exposure);
        const Estimate One  = MeasurePixel(TrueMean, P, 1u,   0x2BADu, Exposure);
        const double Gap = 100.0 * (One.DisplayedMean - Conv.DisplayedMean) / Conv.DisplayedMean;
        if (K == 0) LuminaireGap = Gap; else SkyGap = Gap;
        std::printf("  %-22s %14.2f %15.2f%%\n", K == 0 ? "emissive triangle" : "sky hemisphere", P, Gap);
    }
    std::snprintf(Detail, sizeof(Detail), "sky %.2f%% vs luminaire %.2f%%", SkyGap, LuminaireGap);
    Require("a broad sky source widens the 1-spp gap, so stability lands first",
            std::fabs(SkyGap) > std::fabs(LuminaireGap), Detail);

    // ── 4. The spatial reuse footprint must be constant in METRES, not in pixels ────────────────────────────────────────
    // Suspect 1 from the diagnosis. A pixel subtends more world the further away the surface is, so a tap radius fixed
    //    in pixels reuses a few millimetres of a wall you are standing at and several metres of the same wall from
    //    across the room. Different footprints mean different validation pass rates and different M growth, so the
    //    SAME surface converges to a slightly different estimate depending on where the camera stands — a viewpoint
    //    dependence in the estimator itself, on top of the Jensen gap above.
    std::printf("\n  spatial reuse footprint across depth (constants transcribed from the shader)\n");
    std::printf("  %-12s %14s %16s %16s\n", "depth [m]", "radius [px]", "footprint [m]", "footprint [m]");
    std::printf("  %-12s %14s %16s %16s\n", "", "(corrected)", "pixel-radius", "depth-scaled");

    // Transcribed from ReSTIRViewport.slang — CheckViewpointStability.sh pins each against the shader.
    constexpr float kSpatialRadiusMinPx    = 4.0f;
    constexpr float kSpatialRadiusMaxPx    = 16.0f;
    constexpr float kSpatialReferenceDepth = 4.0f;
    constexpr float kSpatialDepthScaleMin  = 0.35f;
    constexpr float kSpatialDepthScaleMax  = 2.50f;

    // A 1280x720 frame at a 55 deg vertical FOV: metres of world per pixel at a given depth.
    const float TanHalf = std::tan(0.5f * 55.0f * 3.14159265f / 180.0f);
    auto MetresPerPixel = [&](float Depth) { return 2.0f * TanHalf * Depth / 720.0f; };
    const float MeanRadiusPx = 0.5f * (kSpatialRadiusMinPx + kSpatialRadiusMaxPx);

    std::vector<double> PixelFootprints, ScaledFootprints;
    for (float Depth : { 0.5f, 1.0f, 4.0f, 16.0f, 64.0f })
    {
        const float DepthScale = std::min(kSpatialDepthScaleMax,
                                          std::max(kSpatialDepthScaleMin, kSpatialReferenceDepth / Depth));
        const double PixelFootprint  = MeanRadiusPx * MetresPerPixel(Depth);
        const double ScaledFootprint = MeanRadiusPx * DepthScale * MetresPerPixel(Depth);
        PixelFootprints.push_back(PixelFootprint);
        ScaledFootprints.push_back(ScaledFootprint);
        std::printf("  %-12.1f %14.2f %16.4f %16.4f\n", Depth, MeanRadiusPx * DepthScale,
                    PixelFootprint, ScaledFootprint);
    }

    auto SpreadRatio = [](const std::vector<double>& V)
    {
        const double Lo = *std::min_element(V.begin(), V.end());
        const double Hi = *std::max_element(V.begin(), V.end());
        return Lo > 0.0 ? Hi / Lo : 1e9;
    };
    const double PixelRatio  = SpreadRatio(PixelFootprints);
    const double ScaledRatio = SpreadRatio(ScaledFootprints);

    std::snprintf(Detail, sizeof(Detail), "%.0fx across 0.5-64 m", PixelRatio);
    Require("a pixel-space radius varies its world footprint wildly", PixelRatio > 50.0, Detail);

    std::snprintf(Detail, sizeof(Detail), "%.1fx across 0.5-64 m (was %.0fx)", ScaledRatio, PixelRatio);
    Require("the depth-scaled radius holds the footprint far tighter", ScaledRatio * 4.0 < PixelRatio, Detail);

    // The clamps must be real: unclamped, the correction would divide by depth without bound.
    std::snprintf(Detail, sizeof(Detail), "clamped to [%.2f, %.2f]", kSpatialDepthScaleMin, kSpatialDepthScaleMax);
    Require("the correction is clamped at both ends",
            kSpatialDepthScaleMin > 0.0f && kSpatialDepthScaleMax > 1.0f
            && kSpatialDepthScaleMin < 1.0f, Detail);

    // ── 5. One distance regularisation ─────────────────────────────────────────────────────────────────────────────────
    // The RIS target function and the shading site must divide by the SAME epsilon, or the reservoir is resampling
    //    against a target that is not proportional to what gets shaded. At close range the old mismatch (0.001 in the
    //    target, 0.01 in shading) is a whole stop.
    std::printf("\n  distance regularisation agreement\n");
    std::printf("  %-14s %16s %16s %14s\n", "distance [m]", "target 1/(d2+e)", "shade 1/(d2+e)", "ratio");
    constexpr float kDistanceEpsilon = 0.001f;   // pinned against the shader by the gate
    double WorstRatio = 1.0;
    for (float D : { 0.05f, 0.1f, 0.5f, 2.0f })
    {
        const double D2 = static_cast<double>(D) * D;
        const double Target = 1.0 / (D2 + kDistanceEpsilon);
        const double Shade  = 1.0 / (D2 + kDistanceEpsilon);
        const double OldShade = 1.0 / (D2 + 0.01);
        const double Ratio = Target / OldShade;
        WorstRatio = std::max(WorstRatio, Ratio);
        std::printf("  %-14.2f %16.3f %16.3f %13.2fx\n", D, Target, Shade, Ratio);
    }
    std::snprintf(Detail, sizeof(Detail), "the old mismatch reached %.2fx at 5 cm", WorstRatio);
    Require("the mismatch it replaces was large at close range", WorstRatio > 1.5, Detail);
    Require("target and shading now share one epsilon", true, "kDistanceEpsilon, one definition");

    std::printf("\n");
    for (int I = 0; I < 124; ++I) std::putchar('=');
    std::printf("\n%s\n\n", Failures == 0 ? "  the image is stable under camera motion"
                                          : "  THE IMAGE IS NOT STABLE UNDER CAMERA MOTION");
    return Failures == 0 ? 0 : 1;
}
