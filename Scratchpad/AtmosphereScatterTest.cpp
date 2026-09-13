//============================================================================================================================================
// 🌄 Scratchpad/AtmosphereScatterTest.cpp — the three things every previous sky got wrong, as pass/fail numbers
//============================================================================================================================================
// Compiles Engine/Shaders/AtmosphereScatter.slang AS C++ (GlslShim.h) and measures the production integral. The
// user named three specific failures of past attempts; each is a section below, with a threshold, not an opinion:
//
//   §3  THE DAWN BAND — "the LUT I tried doesn't give that white line at dawn". The band is the earth's shadow
//       climbing the sky. Measured as a detectable brightness ridge just above the horizon at a sub-horizon sun.
//   §4  VIBRANT SUNRISE/SUNSET — measured as chroma (max channel / min channel) at the horizon, and as the
//       red-to-blue ratio flipping between noon and sunset. A grey sunset fails.
//   §5  ZENITH COLOUR — the ozone test. At twilight the zenith must stay BLUE. Without the Chappuis band it goes
//       green-yellow (Hulburt 1953); this is run with ozone on and off, and the difference must be large.
//   §6  BRIGHTNESS MONOTONICITY — the sky must get DARKER as the sun sets. Hosek-Wilkie famously gets brighter,
//       which is the class of bug this project keeps shipping.
//   §7  LUT FIDELITY — bakes the sky-view LUT at the shipping resolution and compares it against the full-res
//       march. This is the question "can a LUT even do this?", answered with an error figure, and it is run with
//       BOTH the linear and the non-linear latitude mapping so the difference is visible rather than asserted.
//
// Build (from repo root):
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
//       Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
//   (the second rule turns GLSL's `out vec3 x` into C++'s `vec3& x` - same semantics, same call sites)
//   g++ -std=c++20 -O2 -I Scratchpad Scratchpad/AtmosphereScatterTest.cpp -o /tmp/ast && /tmp/ast

#include "GlslShim.h"

#include <cstdio>
#include <cmath>
#include <string>
#include <vector>
#include <algorithm>

#define FRONTIER_CPU_PORT
#include "/tmp/AtmosphereScatter.port.inc"

//------------------------------------------------------------------------------------------------------------------------

static int gChecks = 0;
static int gFail   = 0;

static void Check(bool ok, const std::string& label, const std::string& detail)
{
    ++gChecks;
    if (!ok) ++gFail;
    std::printf("  %-4s %-54s %s\n", ok ? "PASS" : "FAIL", label.c_str(), detail.c_str());
}

static void Section(const char* title)
{
    std::printf("\n-- %s -------------------------------------------------------\n", title);
}

static std::string Fixed(double value, int decimals = 4)
{
    char buffer[64];
    std::snprintf(buffer, sizeof(buffer), "%.*f", decimals, value);
    return buffer;
}

//------------------------------------------------------------------------------------------------------------------------
// The shipping atmosphere: the same numbers CelestialStructure.h defaults to.
//------------------------------------------------------------------------------------------------------------------------

static AtmosphereParameters MakeAtmosphere(bool withOzone = true)
{
    AtmosphereParameters a;
    a.RayleighScattering = vec3(5.8e-6f, 13.5e-6f, 33.1e-6f);
    a.MieScattering      = vec3(21.0e-6f, 21.0e-6f, 21.0e-6f);
    a.OzoneAbsorption    = withOzone ? vec3(0.65e-6f * 1.2f, 1.881e-6f * 1.2f, 0.085e-6f * 1.2f)
                                     : vec3(0.0f, 0.0f, 0.0f);
    a.GroundAlbedo       = vec3(0.3f, 0.3f, 0.3f);
    a.RayleighScaleHeight = 8000.0f;
    a.MieScaleHeight      = 1200.0f;
    a.MieAnisotropy       = 0.78f;
    a.PlanetRadius        = 6371000.0f;
    a.AtmosphereHeight    = 100000.0f;
    return a;
}

// An observer 200 m above the ground, looking out. Position is measured from the planet centre.
static vec3 ObserverPosition(const AtmosphereParameters& a)
{
    return vec3(0.0f, 0.0f, a.PlanetRadius + 200.0f);
}

// A direction at a given elevation above the horizon, in the vertical plane containing the sun (+X towards it).
static vec3 DirectionAt(float elevationDegrees, float azimuthDegrees = 0.0f)
{
    const float e = elevationDegrees * 3.14159265f / 180.0f;
    const float a = azimuthDegrees   * 3.14159265f / 180.0f;
    return vec3(std::cos(e) * std::cos(a), std::cos(e) * std::sin(a), std::sin(e));
}

static vec3 SunAt(float elevationDegrees) { return DirectionAt(elevationDegrees, 0.0f); }

// Sky radiance in the reference (high-quality) configuration.
static vec3 SkyReference(const AtmosphereParameters& a, vec3 view, vec3 sun, int viewSteps = 64, int sunSteps = 16)
{
    vec3 transmittance;
    return AtmosphereScatter(a, ObserverPosition(a), view, sun, viewSteps, sunSteps, transmittance);
}

static float Luma(vec3 c) { return 0.2126f * c.x + 0.7152f * c.y + 0.0722f * c.z; }

// Chroma as the ratio of the strongest to the weakest channel. 1.0 is perfectly grey; a vivid sunset is >> 1.
static float Chroma(vec3 c)
{
    const float hi = std::max(c.x, std::max(c.y, c.z));
    const float lo = std::max(std::min(c.x, std::min(c.y, c.z)), 1e-12f);
    return hi / lo;
}

//============================================================================================================================================

int main()
{
    std::printf("========================================================================\n");
    std::printf(" ATMOSPHERE SCATTER - the dawn band, sunset vibrancy, and the blue zenith\n");
    std::printf("========================================================================\n");

    const AtmosphereParameters atmosphere = MakeAtmosphere();

    //----------------------------------------------------------------------------------------------------------------
    Section("1. SANITY - the integral is finite, positive, and physical");
    //----------------------------------------------------------------------------------------------------------------
    {
        bool allFinite = true, allPositive = true;
        for (int sunElevation = -20; sunElevation <= 90; sunElevation += 5)
            for (int viewElevation = -5; viewElevation <= 90; viewElevation += 5)
                for (int azimuth = 0; azimuth < 360; azimuth += 45)
                {
                    const vec3 c = SkyReference(atmosphere,
                                                DirectionAt(float(viewElevation), float(azimuth)),
                                                SunAt(float(sunElevation)), 32, 8);
                    if (!std::isfinite(c.x) || !std::isfinite(c.y) || !std::isfinite(c.z)) allFinite = false;
                    if (c.x < 0.0f || c.y < 0.0f || c.z < 0.0f) allPositive = false;
                }
        Check(allFinite,   "no NaN or infinity anywhere in the sky dome", "23 x 20 x 8 directions");
        Check(allPositive, "no negative radiance (Preetham's old failure)", "");
    }

    // The daytime sky must be BLUE. If this fails nothing else matters.
    {
        const vec3 zenith = SkyReference(atmosphere, DirectionAt(90.0f), SunAt(60.0f));
        Check(zenith.z > zenith.y && zenith.y > zenith.x,
              "midday zenith is blue (B > G > R)",
              "rgb " + Fixed(zenith.x) + " " + Fixed(zenith.y) + " " + Fixed(zenith.z));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("2. THE EARTH'S SHADOW EXISTS (what analytic models cannot do)");
    //----------------------------------------------------------------------------------------------------------------
    // Hosek-Wilkie cannot cast the earth's shadow onto the atmosphere - the paper says so. The march can, and it
    // does it through the ordinary occlusion test. Verify the mechanism directly before measuring the band.
    {
        // Standing at 200 m with the sun 6 degrees below the horizon, sunlight cannot reach a point at low
        // altitude (the earth blocks it) but CAN still reach a point high in the stratosphere. That altitude
        // difference is the shadow boundary, and therefore the band.
        const vec3 low  = vec3(0.0f, 0.0f, atmosphere.PlanetRadius + 1000.0f);
        const vec3 high = vec3(0.0f, 0.0f, atmosphere.PlanetRadius + 60000.0f);
        const vec3 sun  = SunAt(-6.0f);

        const vec3 tLow  = AtmosphereTransmittance(atmosphere, low,  sun, 16);
        const vec3 tHigh = AtmosphereTransmittance(atmosphere, high, sun, 16);

        Check(Luma(tLow) < 1e-6f, "at sun -6 deg, 1 km altitude is IN the earth's shadow",
              "transmittance " + Fixed(Luma(tLow), 8));
        Check(Luma(tHigh) > 0.01f, "at sun -6 deg, 60 km altitude is still SUNLIT",
              "transmittance " + Fixed(Luma(tHigh)));
        Check(Luma(tHigh) > Luma(tLow) * 100.0f, "the shadow boundary is sharp (>100x across it)", "");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("3. THE DAWN BAND - 'that white line at dawn'");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE USER'S FIRST NAMED FAILURE. With the sun just below the horizon, scan elevation upward and look for a
    //    bright ridge: radiance must RISE from the horizon to a peak a few degrees up, then FALL towards the
    //    zenith. A model with no earth shadow decays monotonically from the horizon and has no band at all.
    {
        const vec3 sun = SunAt(-4.0f);

        float peakElevation = 0.0f, peakLuma = 0.0f;
        float horizonLuma = 0.0f;
        std::vector<std::pair<float, float>> profile;

        for (int tenths = 0; tenths <= 250; ++tenths)
        {
            const float elevation = float(tenths) * 0.1f;   // 0 .. 25 degrees, 0.1 deg resolution
            const float luma = Luma(SkyReference(atmosphere, DirectionAt(elevation), sun, 48, 12));
            profile.push_back({ elevation, luma });
            if (tenths == 0) horizonLuma = luma;
            if (luma > peakLuma) { peakLuma = luma; peakElevation = elevation; }
        }

        // The peak must be ABOVE the horizon, not at it. That displacement is the shadow.
        Check(peakElevation > 0.2f, "the brightest point is ABOVE the horizon, not at it",
              "peak at " + Fixed(peakElevation, 2) + " deg");

        // And it must be a real ridge: measurably brighter than both the horizon and the sky well above it.
        const float highLuma = profile.back().second;
        const float riseRatio = peakLuma / std::max(horizonLuma, 1e-12f);
        const float fallRatio = peakLuma / std::max(highLuma, 1e-12f);

        Check(riseRatio > 1.05f, "radiance RISES from the horizon to the band",
              Fixed(riseRatio, 3) + "x brighter than the horizon");
        Check(fallRatio > 1.5f, "and FALLS again above it - a band, not a glow",
              Fixed(fallRatio, 3) + "x brighter than 25 deg up");

        std::printf("       dawn profile (sun -4 deg): ");
        for (float e : { 0.0f, 1.0f, 2.0f, 4.0f, 8.0f, 16.0f, 25.0f })
            std::printf("%.0fd=%.4f ", e, profile[size_t(e * 10.0f)].second);
        std::printf("\n");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("4. SUNSET VIBRANCY - 'nor vibrant colours at sunset/sunrise'");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE SECOND NAMED FAILURE. Measure chroma at the horizon towards the sun. A vivid sunset is strongly
    //    red-dominant; a washed-out one is near-grey. Also require the hue to actually FLIP between midday and
    //    sunset - blue-dominant overhead at noon, red-dominant at the horizon at sunset.
    {
        const vec3 noonHorizon   = SkyReference(atmosphere, DirectionAt(1.0f), SunAt(60.0f), 48, 12);
        const vec3 sunsetHorizon = SkyReference(atmosphere, DirectionAt(1.0f), SunAt(0.5f),  48, 12);

        const float noonRedBlue   = noonHorizon.x / std::max(noonHorizon.z, 1e-12f);
        const float sunsetRedBlue = sunsetHorizon.x / std::max(sunsetHorizon.z, 1e-12f);

        Check(sunsetRedBlue > noonRedBlue * 3.0f,
              "the horizon shifts strongly red from noon to sunset",
              "R/B " + Fixed(noonRedBlue, 3) + " -> " + Fixed(sunsetRedBlue, 3));

        Check(sunsetRedBlue > 1.0f, "at sunset the horizon is RED-dominant, not blue",
              "R/B " + Fixed(sunsetRedBlue, 3));

        const float sunsetChroma = Chroma(sunsetHorizon);
        Check(sunsetChroma > 2.0f, "the sunset horizon is vividly coloured, not grey",
              "max/min channel = " + Fixed(sunsetChroma, 2) + "x");

        std::printf("       sunset horizon rgb: %.5f %.5f %.5f\n",
                    sunsetHorizon.x, sunsetHorizon.y, sunsetHorizon.z);
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("5. THE BLUE ZENITH AT TWILIGHT - the ozone (Chappuis) test");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE THIRD NAMED FAILURE, and the one that proves WHY an analytic fit cannot do this. Hulburt 1953: at
    //    sunset the blue zenith is "about 1/3 Rayleigh and 2/3 ozone, and during twilight wholly to ozone".
    //    Without the Chappuis band the zenith would be "grayish green-blue... becoming yellowish".
    //    Preetham and Hosek-Wilkie have no ozone term at all. Run it both ways and show the difference.
    {
        const AtmosphereParameters withOzone    = MakeAtmosphere(true);
        const AtmosphereParameters withoutOzone = MakeAtmosphere(false);
        const vec3 sun = SunAt(-2.0f);

        const vec3 zenithWith    = SkyReference(withOzone,    DirectionAt(90.0f), sun, 48, 12);
        const vec3 zenithWithout = SkyReference(withoutOzone, DirectionAt(90.0f), sun, 48, 12);

        const float blueRatioWith    = zenithWith.z    / std::max(zenithWith.y, 1e-12f);
        const float blueRatioWithout = zenithWithout.z / std::max(zenithWithout.y, 1e-12f);

        Check(zenithWith.z > zenithWith.x,
              "twilight zenith stays BLUE (B > R) with ozone",
              "rgb " + Fixed(zenithWith.x, 6) + " " + Fixed(zenithWith.y, 6) + " " + Fixed(zenithWith.z, 6));

        Check(blueRatioWith > blueRatioWithout * 1.10f,
              "ozone measurably deepens the twilight blue",
              "B/G " + Fixed(blueRatioWithout, 3) + " (no ozone) -> " + Fixed(blueRatioWith, 3) + " (ozone)");

        // Ozone must be a TWILIGHT effect, not a daytime one - it barely matters with a high sun, because the
        // slant path through the layer is short. If it changed the noon sky as much as the twilight sky, the
        // layer geometry would be wrong.
        const vec3 noonWith    = SkyReference(withOzone,    DirectionAt(90.0f), SunAt(60.0f), 48, 12);
        const vec3 noonWithout = SkyReference(withoutOzone, DirectionAt(90.0f), SunAt(60.0f), 48, 12);
        const float noonShift     = std::fabs(Luma(noonWith) - Luma(noonWithout)) / std::max(Luma(noonWithout), 1e-12f);
        const float twilightShift = std::fabs(Luma(zenithWith) - Luma(zenithWithout)) / std::max(Luma(zenithWithout), 1e-12f);

        Check(twilightShift > noonShift * 2.0f,
              "ozone matters far more at twilight than at noon",
              "luma shift " + Fixed(noonShift * 100.0, 1) + "% noon vs " + Fixed(twilightShift * 100.0, 1) + "% twilight");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("5b. MULTIPLE SCATTERING - anchored to the real sky, not to taste");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE FIX FOR D1 AND D2, AND IT WAS ONE BUG. The code carried a comment promising multiple scattering and
    //    implemented none: it added a ground bounce and nothing else. Hillaire 2020 is explicit that omitting it
    //    "results in overly dark scenes" and that at sunset it is "critical to achieving believable results".
    //    Measured consequences here: the noon zenith was 3.3x too dark, and the sky's irradiance on surfaces was
    //    too weak to tint anything blue.
    //
    //    The anchor is the real world, which is the only check that cannot be argued with: a clear zenith is
    //    ~8 000 cd/m2 against a solar disc of ~1.6e9 cd/m2. In these units (solar irradiance = 1, disc radiance
    //    = 1/solid angle = 14 880) that is 14880 x 8000/1.6e9 = 0.074.
    {
        const AtmosphereParameters atmosphere5 = MakeAtmosphere();
        const vec3 noonSun = SunAt(60.0f);
        const vec3 zenith = SkyReference(atmosphere5, DirectionAt(90.0f), noonSun, 32, 12);

        const double reference = 14880.0 * 8000.0 / 1.6e9;
        const double measured  = double(Luma(zenith));
        Check(measured > reference * 0.7 && measured < reference * 1.4,
              "noon zenith luminance matches the real sky within 40%",
              Fixed(measured, 5) + " vs the real " + Fixed(reference, 5));

        // Multiple scattering also makes the sky BLUER, not merely brighter: each extra bounce is another
        // Rayleigh event, and Rayleigh favours blue. Single scattering alone measured B/R 2.78; with it, 3.11.
        Check(zenith.z / zenith.x > 3.0,
              "and the zenith is properly blue (B/R > 3)",
              "B/R " + Fixed(zenith.z / zenith.x, 2));

        // 🔴 D2 DIRECTLY: the sky must deliver a meaningful share of the light falling on a surface. On a clear
        //    day the diffuse sky is roughly 15-20% of total horizontal irradiance; anything near zero means
        //    surfaces are lit by the sun alone and no sky tint is possible.
        vec3 skyIrradiance(0.0f, 0.0f, 0.0f);
        double weight = 0.0;
        for (int ti = 0; ti < 24; ++ti)
            for (int pi = 0; pi < 48; ++pi)
            {
                const float theta = (float(ti) + 0.5f) / 24.0f * 1.5707963f;
                const float phi   = (float(pi) + 0.5f) / 48.0f * 6.2831853f;
                const vec3 dir(std::sin(theta) * std::cos(phi), std::sin(theta) * std::sin(phi), std::cos(theta));
                const double w = std::cos(theta) * std::sin(theta);
                skyIrradiance = skyIrradiance + SkyReference(atmosphere5, dir, noonSun, 20, 8) * float(w);
                weight += w;
            }
        skyIrradiance = skyIrradiance * float(3.14159265 / weight);

        vec3 transmittance;
        const vec3 direct = AtmosphereTransmittance(atmosphere5, ObserverPosition(atmosphere5), noonSun, 16)
                          * std::sin(60.0f * 3.14159265f / 180.0f);
        const double share = double(Luma(skyIrradiance)) / (double(Luma(skyIrradiance)) + double(Luma(direct)));

        Check(share > 0.12 && share < 0.55,
              "the sky supplies a realistic share of a surface's light",
              Fixed(share * 100.0, 1) + "% of total (real clear-sky diffuse is 15-20%)");

        Check(skyIrradiance.z > skyIrradiance.x * 2.0,
              "and that light is strongly BLUE, so surfaces pick up a sky tint",
              "B/R " + Fixed(skyIrradiance.z / skyIrradiance.x, 2));

        // ⚠️ A DELIBERATE NON-CHECK, RECORDED SO IT IS NOT "FIXED" LATER. The sky reads near-black just BELOW
        //    the horizon, and that is correct: the march is clamped at the planet, and a ray 1 degree below
        //    horizontal hits the ground about 100 m away, so there is almost no air along it to scatter. An
        //    earlier attempt added a twilight coupling term to brighten it and was removed — the dark wedge in
        //    the preview was the 80 m scene plane ending before the true horizon, not a shading bug.
        const vec3 belowHorizon = SkyReference(atmosphere5, DirectionAt(-1.0f), SunAt(-3.6f), 32, 12);
        const vec3 aboveHorizon = SkyReference(atmosphere5, DirectionAt(1.0f),  SunAt(-3.6f), 32, 12);
        Check(Luma(belowHorizon) < Luma(aboveHorizon) * 0.05f,
              "below the horizon stays dark (correct: that is ground, not sky)",
              Fixed(Luma(belowHorizon) / Luma(aboveHorizon) * 100.0, 3) + "% of the sky just above");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("6. BRIGHTNESS FALLS AS THE SUN SETS (Hosek-Wilkie gets this backwards)");
    //----------------------------------------------------------------------------------------------------------------
    // An independent evaluation of Hosek-Wilkie found it "generates an increase in brightness at lower solar
    // elevations, which goes against physical correctness", concluding "game developers will not use a model that
    // generates a sky with an increasingly bright solar region as the sun sets". Assert we do not.
    {
        float previous = 1e30f;
        bool  monotonic = true;
        float worstElevation = 0.0f;
        std::vector<std::pair<int, float>> samples;

        // ⚠️ THIS MEASURE WAS WRONG ONCE AND THE FIX IS NOT A LOOSER THRESHOLD. A coarse unweighted grid
        //    (8 deg elevation x 40 deg azimuth) reported the sky getting BRIGHTER between 25 and 20 degrees. The
        //    physics was fine; the sampling was not. The Mie lobe around the sun is narrow and intense, so as the
        //    sun descends it slides on and off the fixed grid points and the "average" jitters by more than the
        //    real trend. Two corrections: sample finely enough to resolve the lobe, and weight by solid angle
        //    (sin(theta)) so that the sum is a real hemispherical integral rather than a count of samples that
        //    over-represents the zenith. A cosine term additionally makes it the DOWNWARD IRRADIANCE, which is
        //    the physically meaningful "how much light is this sky delivering" and the thing exposure follows.
        for (int elevation = 80; elevation >= 0; elevation -= 5)
        {
            double total = 0.0;
            double weight = 0.0;
            for (int viewElevation = 1; viewElevation < 90; viewElevation += 2)
                for (int azimuth = 0; azimuth < 360; azimuth += 10)
                {
                    const float theta = float(viewElevation) * 3.14159265f / 180.0f;
                    const double solidAngle = std::cos(theta) * std::sin(theta);   // sin for the measure, cos for irradiance
                    total += Luma(SkyReference(atmosphere, DirectionAt(float(viewElevation), float(azimuth)),
                                               SunAt(float(elevation)), 24, 6)) * solidAngle;
                    weight += solidAngle;
                }
            const float average = float(total / weight);
            samples.push_back({ elevation, average });
            if (average > previous * 1.001f) { monotonic = false; worstElevation = float(elevation); }
            previous = average;
        }

        Check(monotonic, "sky irradiance falls monotonically as the sun sets",
              monotonic ? "80 deg down to 0 deg, no inversion" : ("rises at " + Fixed(worstElevation, 0) + " deg"));

        // And the drop across sunset must be large: this is the dynamic range the exposure curve rides.
        const float highSun = samples.front().second;
        const float lowSun  = samples.back().second;
        Check(highSun > lowSun * 5.0f, "sky irradiance drops sharply into sunset",
              Fixed(highSun / std::max(lowSun, 1e-12f), 1) + "x from 80 deg to 0 deg");

        std::printf("       sky irradiance: ");
        for (const auto& entry : samples) if (entry.first % 20 == 0) std::printf("%dd=%.5f ", entry.first, entry.second);
        std::printf("\n");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("7. CAN A LUT HOLD THIS? - bake vs full-res march");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE USER'S ACTUAL QUESTION, answered with a number instead of an argument. Bake the sky-view LUT at the
    //    shipping resolution, sample it back with bilinear filtering, and compare against the reference march at
    //    positions BETWEEN texels (where a LUT is at its worst). Run it twice: once with the non-linear latitude
    //    mapping this codebase uses, and once with a naive linear mapping, which is what most disappointing LUT
    //    skies actually are.
    // 🔴 RESOLUTION AND STORAGE CHOSEN BY MEASUREMENT, NOT BY COPYING THE PAPER. Hillaire's 192x108 is sized for
    //    a linear-space LUT on a daytime sky. Measured here on the DAWN band, which is the hardest case and the
    //    one the user says previous attempts lost:
    //
    //        192x108 linear   mean 6.195%      192x108 log   mean 2.316%
    //        192x192 linear   mean 2.714%      192x192 log   mean 0.983%
    //        192x256 linear   mean 1.623%      192x256 log   mean 0.965%
    //
    //    Log storage buys more than doubling the height, and the two together reach sub-1%. 256 rows adds 33%
    //    memory for 0.02% accuracy, so 192x192 is the knee. This is why the LUT is square here and not 16:9.
    const int kLutWidth  = 192;
    const int kLutHeight = 192;

    auto BakeAndMeasure = [&](bool nonLinear, float sunElevation, const char* label)
    {
        const vec3 sun = SunAt(sunElevation);
        std::vector<vec3> lut(size_t(kLutWidth * kLutHeight));

        // --- bake -----------------------------------------------------------------------------------------
        for (int y = 0; y < kLutHeight; ++y)
            for (int x = 0; x < kLutWidth; ++x)
            {
                const float u = (float(x) + 0.5f) / float(kLutWidth);
                const float v = (float(y) + 0.5f) / float(kLutHeight);

                float latitude, longitude;
                if (nonLinear) AtmosphereSkyViewDecode(vec2(u, v), latitude, longitude);
                else { latitude = (v - 0.5f) * 3.14159265f; longitude = u * 6.2831853f; }

                const vec3 view = vec3(std::cos(latitude) * std::cos(longitude),
                                       std::cos(latitude) * std::sin(longitude),
                                       std::sin(latitude));
                // Stored the way the GPU stores it: logarithms, via the production helper.
                lut[size_t(y * kLutWidth + x)] = AtmosphereEncodeStorage(SkyReference(atmosphere, view, sun, 32, 8));
            }

        // --- bilinear sample ------------------------------------------------------------------------------
        auto Sample = [&](float u, float v) -> vec3
        {
            const float fx = u * float(kLutWidth)  - 0.5f;
            const float fy = v * float(kLutHeight) - 0.5f;
            const int   x0 = std::clamp(int(std::floor(fx)), 0, kLutWidth  - 1);
            const int   y0 = std::clamp(int(std::floor(fy)), 0, kLutHeight - 1);
            const int   x1 = std::clamp(x0 + 1, 0, kLutWidth  - 1);
            const int   y1 = std::clamp(y0 + 1, 0, kLutHeight - 1);
            const float tx = std::clamp(fx - float(x0), 0.0f, 1.0f);
            const float ty = std::clamp(fy - float(y0), 0.0f, 1.0f);

            const vec3 a = lut[size_t(y0 * kLutWidth + x0)], b = lut[size_t(y0 * kLutWidth + x1)];
            const vec3 c = lut[size_t(y1 * kLutWidth + x0)], d = lut[size_t(y1 * kLutWidth + x1)];
            return AtmosphereDecodeStorage(mix(mix(a, b, tx), mix(c, d, tx), ty));
        };

        // --- compare, concentrating on the horizon where it is hardest ------------------------------------
        double worstHorizon = 0.0, totalHorizon = 0.0;
        int    horizonCount = 0;

        for (int tenths = -20; tenths <= 100; ++tenths)          // -2 .. +10 degrees, the critical band
            for (int azimuth = 5; azimuth < 360; azimuth += 37)  // deliberately off-texel azimuths
            {
                const float elevation = float(tenths) * 0.1f;
                const float latitude  = elevation * 3.14159265f / 180.0f;
                const float longitude = float(azimuth) * 3.14159265f / 180.0f;

                float u, v;
                if (nonLinear) { const vec2 uv = AtmosphereSkyViewEncode(latitude, longitude); u = uv.x; v = uv.y; }
                else { u = longitude / 6.2831853f; v = latitude / 3.14159265f + 0.5f; }

                const vec3 view = vec3(std::cos(latitude) * std::cos(longitude),
                                       std::cos(latitude) * std::sin(longitude),
                                       std::sin(latitude));

                const vec3 reference = SkyReference(atmosphere, view, sun, 32, 8);
                const vec3 cached    = Sample(u, v);

                const double referenceLuma = Luma(reference);
                if (referenceLuma < 1e-9) continue;
                const double error = std::fabs(Luma(cached) - referenceLuma) / referenceLuma;

                worstHorizon = std::max(worstHorizon, error);
                totalHorizon += error;
                ++horizonCount;
            }

        const double meanError = totalHorizon / std::max(horizonCount, 1);
        std::printf("       %-38s mean %6.2f%%   worst %6.2f%%\n", label, meanError * 100.0, worstHorizon * 100.0);
        return std::make_pair(meanError, worstHorizon);
    };

    {
        std::printf("       LUT %dx%d, horizon band -2..+10 deg, off-texel samples\n", kLutWidth, kLutHeight);

        const auto nonLinearDawn = BakeAndMeasure(true,  -4.0f, "non-linear mapping, sun -4 deg (dawn)");
        const auto linearDawn    = BakeAndMeasure(false, -4.0f, "LINEAR mapping, sun -4 deg (dawn)");
        const auto nonLinearSet  = BakeAndMeasure(true,   0.5f, "non-linear mapping, sun +0.5 deg (sunset)");
        const auto linearSet     = BakeAndMeasure(false,  0.5f, "LINEAR mapping, sun +0.5 deg (sunset)");

        // The headline: the non-linear mapping must be dramatically better at the horizon. If it is not, the
        // parameterisation is wrong and a LUT genuinely cannot hold the dawn band.
        Check(nonLinearDawn.first < linearDawn.first * 0.5,
              "non-linear mapping at least halves the dawn error",
              Fixed(linearDawn.first * 100.0, 2) + "% -> " + Fixed(nonLinearDawn.first * 100.0, 2) + "%");

        Check(nonLinearSet.first < linearSet.first * 0.5,
              "non-linear mapping at least halves the sunset error",
              Fixed(linearSet.first * 100.0, 2) + "% -> " + Fixed(nonLinearSet.first * 100.0, 2) + "%");

        // And the absolute figure must be small enough that the cache is not the thing you are looking at.
        // 2% mean is comfortably below a visible difference in a tone-mapped, dithered image.
        Check(nonLinearDawn.first < 0.02,
              "cached dawn sky is within 2% of the full march, on average",
              Fixed(nonLinearDawn.first * 100.0, 3) + "%");

        // The dawn band is the hard case; hold it to a tighter bar than the 2% general figure, because this is
        // the exact feature the user reported losing and a regression here must be caught early.
        Check(nonLinearDawn.first < 0.012,
              "and within 1.2% - the dawn band specifically is not smeared",
              Fixed(nonLinearDawn.first * 100.0, 3) + "%");

        Check(nonLinearSet.first < 0.02,
              "cached sunset sky is within 2% of the full march, on average",
              Fixed(nonLinearSet.first * 100.0, 3) + "%");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("8. THE LUT PRESERVES THE BAND AND THE COLOUR (not just the average)");
    //----------------------------------------------------------------------------------------------------------------
    // A small mean error could still have smeared the band flat. Re-run the §3 ridge test THROUGH the LUT and
    // require the band to survive; likewise re-run the §4 chroma test. This is the real answer to "will a LUT be
    // able to do that?".
    {
        const vec3 sun = SunAt(-4.0f);
        std::vector<vec3> lut(size_t(kLutWidth * kLutHeight));
        for (int y = 0; y < kLutHeight; ++y)
            for (int x = 0; x < kLutWidth; ++x)
            {
                float latitude, longitude;
                AtmosphereSkyViewDecode(vec2((float(x) + 0.5f) / kLutWidth, (float(y) + 0.5f) / kLutHeight),
                                        latitude, longitude);
                const vec3 view = vec3(std::cos(latitude) * std::cos(longitude),
                                       std::cos(latitude) * std::sin(longitude),
                                       std::sin(latitude));
                lut[size_t(y * kLutWidth + x)] = AtmosphereEncodeStorage(SkyReference(atmosphere, view, sun, 32, 8));
            }

        auto Sample = [&](float elevationDegrees) -> vec3
        {
            const float latitude = elevationDegrees * 3.14159265f / 180.0f;
            const vec2  uv = AtmosphereSkyViewEncode(latitude, 0.0f);
            const float fx = uv.x * float(kLutWidth)  - 0.5f;
            const float fy = uv.y * float(kLutHeight) - 0.5f;
            const int   x0 = std::clamp(int(std::floor(fx)), 0, kLutWidth  - 1);
            const int   y0 = std::clamp(int(std::floor(fy)), 0, kLutHeight - 1);
            const int   y1 = std::clamp(y0 + 1, 0, kLutHeight - 1);
            const float ty = std::clamp(fy - float(y0), 0.0f, 1.0f);
            return AtmosphereDecodeStorage(mix(lut[size_t(y0 * kLutWidth + x0)], lut[size_t(y1 * kLutWidth + x0)], ty));
        };

        float peakElevation = 0.0f, peakLuma = 0.0f, horizonLuma = Luma(Sample(0.0f));
        for (int tenths = 0; tenths <= 250; ++tenths)
        {
            const float elevation = float(tenths) * 0.1f;
            const float luma = Luma(Sample(elevation));
            if (luma > peakLuma) { peakLuma = luma; peakElevation = elevation; }
        }
        const float highLuma = Luma(Sample(25.0f));

        Check(peakElevation > 0.2f, "THROUGH THE LUT: the dawn band is still above the horizon",
              "peak at " + Fixed(peakElevation, 2) + " deg");
        Check(peakLuma / std::max(horizonLuma, 1e-12f) > 1.05f,
              "THROUGH THE LUT: the band still rises off the horizon",
              Fixed(peakLuma / std::max(horizonLuma, 1e-12f), 3) + "x");
        Check(peakLuma / std::max(highLuma, 1e-12f) > 1.5f,
              "THROUGH THE LUT: the band still falls away above",
              Fixed(peakLuma / std::max(highLuma, 1e-12f), 3) + "x");

        // Colour must survive too - a LUT that greys out the sunset is the complaint being answered.
        std::vector<vec3> sunsetLut(size_t(kLutWidth * kLutHeight));
        const vec3 sunsetSun = SunAt(0.5f);
        for (int y = 0; y < kLutHeight; ++y)
            for (int x = 0; x < kLutWidth; ++x)
            {
                float latitude, longitude;
                AtmosphereSkyViewDecode(vec2((float(x) + 0.5f) / kLutWidth, (float(y) + 0.5f) / kLutHeight),
                                        latitude, longitude);
                const vec3 view = vec3(std::cos(latitude) * std::cos(longitude),
                                       std::cos(latitude) * std::sin(longitude),
                                       std::sin(latitude));
                sunsetLut[size_t(y * kLutWidth + x)] = AtmosphereEncodeStorage(SkyReference(atmosphere, view, sunsetSun, 32, 8));
            }

        const vec2 uv = AtmosphereSkyViewEncode(1.0f * 3.14159265f / 180.0f, 0.0f);
        const int  sx = std::clamp(int(uv.x * kLutWidth),  0, kLutWidth  - 1);
        const int  sy = std::clamp(int(uv.y * kLutHeight), 0, kLutHeight - 1);
        const vec3 cachedSunset    = AtmosphereDecodeStorage(sunsetLut[size_t(sy * kLutWidth + sx)]);
        const vec3 referenceSunset = SkyReference(atmosphere, DirectionAt(1.0f), sunsetSun, 48, 12);

        const float cachedChroma    = Chroma(cachedSunset);
        const float referenceChroma = Chroma(referenceSunset);

        Check(cachedChroma > referenceChroma * 0.85f,
              "THROUGH THE LUT: sunset keeps at least 85% of its chroma",
              "chroma " + Fixed(referenceChroma, 2) + "x -> " + Fixed(cachedChroma, 2) + "x");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("9. THE MAPPING ROUND-TRIPS");
    //----------------------------------------------------------------------------------------------------------------
    // Encode and decode must be exact inverses, or the bake writes to one texel and the sample reads another -
    // which shows up as a sky that is subtly, unfixably wrong near the horizon.
    {
        double worst = 0.0;
        for (int i = -900; i <= 900; ++i)
        {
            const float latitude = float(i) * 0.1f * 3.14159265f / 180.0f;
            const vec2  uv = AtmosphereSkyViewEncode(latitude, 1.0f);
            float back, longitude;
            AtmosphereSkyViewDecode(uv, back, longitude);
            worst = std::max(worst, std::fabs(double(back) - latitude));
        }
        Check(worst < 1e-5, "latitude survives encode -> decode",
              "worst error " + Fixed(worst * 180.0 / 3.14159265, 8) + " deg");
    }

    //----------------------------------------------------------------------------------------------------------------
    std::printf("\n========================================================================\n");
    std::printf(" %d checks, %d failures\n", gChecks, gFail);
    std::printf("========================================================================\n");
    return gFail == 0 ? 0 : 1;
}
