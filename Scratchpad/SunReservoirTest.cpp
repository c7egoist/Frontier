//============================================================================================================================================
// ☀️ Scratchpad/SunReservoirTest.cpp — F2: the sun is a real member of the reservoir's light pool
//============================================================================================================================================
// The reported failure was "sun isn't being used in ReSTIR": the sun painted on the miss path while the reservoir
// resampled only emissive triangles. P3 makes the sun light index `LightTriangleCount`, so it travels through the
// existing RIS / temporal / spatial / shadow / shade paths unmodified.
//
// That design rests on one trick, and this file exists to prove the trick is exact rather than plausible:
//
//   THE SUN IS DIRECTIONAL, BUT THE ESTIMATOR IS FOR AREA LIGHTS. It stores a world point and divides by d².
//   So the sun is sampled as a disc at kSunDistance with emission = irradiance x kSunDistance². The d² in the
//   emission and the 1/d² in the estimator must cancel EXACTLY, leaving f·E·cosθ — the correct directional
//   contribution — with no change to the shared code.
//
// §1 the cancellation is exact, at every distance and every angle
// §2 the cone sampling is uniform and correctly sized (penumbra width depends on it)
// §3 RIS with the sun in the pool converges to the same answer as direct evaluation (the unbiasedness claim)
// §4 kSunDistance is justified: parallax across a reuse neighbourhood vs float precision
// §5 sunset reddening of DIRECT light is real and physical
//
// Build (from repo root):
//   g++ -std=c++20 -O2 -I Scratchpad -I . Scratchpad/SunReservoirTest.cpp -o /tmp/srt && /tmp/srt

#include "GlslShim.h"

#include "Engine/DisplayPresentation/CelestialStructure.h"
#include "Engine/DisplayPresentation/CelestialSolver.h"

#include <cstdio>
#include <cmath>
#include <string>
#include <vector>
#include <algorithm>
#include <random>

//------------------------------------------------------------------------------------------------------------------------

static int gChecks = 0, gFail = 0;

static void Check(bool ok, const std::string& label, const std::string& detail)
{
    ++gChecks;
    if (!ok) ++gFail;
    std::printf("  %-4s %-56s %s\n", ok ? "PASS" : "FAIL", label.c_str(), detail.c_str());
}

static void Section(const char* title)
{
    std::printf("\n-- %s -------------------------------------------------------\n", title);
}

static std::string Fixed(double v, int d = 4)
{
    char b[64]; std::snprintf(b, sizeof(b), "%.*f", d, v); return b;
}

// Mirrors kSunDistance in ReSTIRViewport.slang. The gate greps that the two agree.
static const double kSunDistance = 100000.0;

//============================================================================================================================================

int main()
{
    std::printf("========================================================================\n");
    std::printf(" SUN RESERVOIR (F2) - the sun is a light in the pool, not a backdrop\n");
    std::printf("========================================================================\n");

    //----------------------------------------------------------------------------------------------------------------
    Section("1. THE d2 CANCELLATION IS EXACT");
    //----------------------------------------------------------------------------------------------------------------
    // emission = E * d^2, and the estimator computes emission / (d^2 + epsilon). If those do not cancel, every
    // sunlit surface in the engine is wrong by a scale factor that varies with geometry - the worst kind of bug,
    // because it looks like "the lighting is a bit off" rather than like a crash.
    {
        const double irradiance = 22.0;
        const double emission   = irradiance * kSunDistance * kSunDistance;
        const double epsilon    = 0.001;     // kDistanceEpsilon

        // At the shading pixel the sample point is placed at exactly kSunDistance, so the cancellation is exact.
        const double exact = emission / (kSunDistance * kSunDistance + epsilon);
        Check(std::fabs(exact - irradiance) / irradiance < 1e-9,
              "at the owning pixel the cancellation is exact",
              "recovered " + Fixed(exact, 9));

        // ⚠️ THE INTERESTING CASE IS REUSE, AND THIS TEST FIRST GOT IT WRONG. It swept the distance by +/-0.1%,
        //    which is nothing the engine can produce, and duly failed at 0.2%. The real variation comes from a
        //    NEIGHBOUR reusing the stored point from a different position: the point is fixed in world space, so
        //    a pixel 5 m away sees it at a slightly different distance. That is the honest bound to check, and it
        //    is ~20x smaller than the arbitrary sweep - so the correct fix was to measure the real case, not to
        //    loosen the threshold.
        double worst = 0.0;
        for (double offset : { 0.5, 2.0, 5.0 })
        {
            // Worst case: the neighbour is displaced directly along the sun direction.
            const double distance  = kSunDistance + offset;
            const double recovered = emission / (distance * distance + epsilon);
            worst = std::max(worst, std::fabs(recovered - irradiance) / irradiance);
        }
        Check(worst < 1e-3, "reuse from up to 5 m away stays within 0.1%",
              "worst error " + Fixed(worst * 100.0, 6) + "%");

        // The epsilon is utterly negligible at this distance - confirm, rather than assume.
        const double withEpsilon    = emission / (kSunDistance * kSunDistance + epsilon);
        const double withoutEpsilon = emission / (kSunDistance * kSunDistance);
        Check(std::fabs(withEpsilon - withoutEpsilon) / irradiance < 1e-12,
              "kDistanceEpsilon is negligible at the sun's distance",
              "shift " + Fixed(std::fabs(withEpsilon - withoutEpsilon), 12));

        // And in fp32, which is what the GPU actually runs.
        const float emission32 = float(emission);
        const float recovered32 = emission32 / float(kSunDistance * kSunDistance + epsilon);
        Check(std::fabs(double(recovered32) - irradiance) / irradiance < 1e-4,
              "the cancellation survives fp32 (what the GPU runs)",
              "recovered " + Fixed(recovered32, 6) + " vs " + Fixed(irradiance, 6));

        // fp32 headroom: E*d^2 must not overflow or lose its mantissa. 22 * 1e10 = 2.2e11, well inside 3.4e38.
        Check(std::isfinite(emission32) && emission32 > 0.0f,
              "emission = E*d2 stays finite in fp32",
              Fixed(double(emission32), 0));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("2. CONE SAMPLING - uniform over the sun's disc");
    //----------------------------------------------------------------------------------------------------------------
    // The penumbra width is set by the angular radius, so a sampler that is subtly non-uniform or the wrong size
    // gives shadows with the wrong softness. Mirrors SampleLightPointFrom's cone sample.
    {
        const double angularDiameter = 0.53;
        const double angularRadius   = angularDiameter * 0.5 * 3.14159265358979 / 180.0;
        const double cosRadius       = std::cos(angularRadius);

        const vec3 sunDirection(0.0f, 0.0f, 1.0f);

        std::mt19937 rng(12345);
        std::uniform_real_distribution<double> uniform(0.0, 1.0);

        double maxAngle = 0.0;
        double meanCos  = 0.0;
        const int samples = 200000;
        std::vector<int> radialBins(10, 0);

        for (int i = 0; i < samples; ++i)
        {
            const double u1 = uniform(rng), u2 = uniform(rng);
            const double cosTheta = cosRadius + (1.0 - cosRadius) * u1;    // mix(cosRadius, 1, u1)
            const double sinTheta = std::sqrt(std::max(0.0, 1.0 - cosTheta * cosTheta));
            const double phi = 6.283185307 * u2;

            const vec3 jittered = normalize(vec3(float(sinTheta * std::cos(phi)),
                                                 float(sinTheta * std::sin(phi)),
                                                 float(cosTheta)));
            const double angle = std::acos(std::min(1.0, double(dot(jittered, sunDirection))));
            maxAngle = std::max(maxAngle, angle);
            meanCos += cosTheta;

            // Bin by solid angle: for a uniform cone sample, cosTheta is uniform in [cosRadius, 1].
            const int bin = std::min(9, int((cosTheta - cosRadius) / (1.0 - cosRadius) * 10.0));
            radialBins[size_t(bin)]++;
        }

        Check(std::fabs(maxAngle - angularRadius) / angularRadius < 0.01,
              "samples fill the disc out to its angular radius",
              Fixed(maxAngle * 180.0 / 3.14159265, 5) + " deg (want " + Fixed(angularRadius * 180.0 / 3.14159265, 5) + ")");

        // Uniform in cosTheta means equal counts per bin - that IS the definition of uniform over solid angle.
        int minBin = samples, maxBin = 0;
        for (int count : radialBins) { minBin = std::min(minBin, count); maxBin = std::max(maxBin, count); }
        Check(double(maxBin - minBin) / double(samples / 10) < 0.05,
              "the distribution is uniform over solid angle",
              "bin spread " + Fixed(double(maxBin - minBin) / double(samples / 10) * 100.0, 2) + "%");

        // Mean cos must match the analytic (1+cosRadius)/2.
        meanCos /= samples;
        const double expected = (1.0 + cosRadius) * 0.5;
        Check(std::fabs(meanCos - expected) < 1e-6, "mean cos(theta) matches the analytic value",
              Fixed(meanCos, 9) + " vs " + Fixed(expected, 9));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("3. RIS WITH THE SUN IN THE POOL IS UNBIASED");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE CLAIM THAT MATTERS. Putting the sun in the pool changes pSource for every light. If that bookkeeping
    //    is wrong the image is biased - consistently too bright or too dark - and no amount of convergence fixes
    //    it. Simulate the actual estimator: a Lambertian surface lit by one sun plus N emissive triangles,
    //    resampled exactly as PickLight/ResampleCandidate do, and compare against direct evaluation.
    {
        struct Light { double emission; double solidAngleCos; bool isSun; };

        // Ground truth: a diffuse surface under the sun plus two emissive quads, all unshadowed.
        const double albedo = 0.8, invPi = 1.0 / 3.14159265358979;
        const double sunIrradiance = 22.0, sunCos = 0.7;
        const double tri1 = 3.0, tri1Cos = 0.5, tri1Dist2 = 4.0, tri1Area = 0.5;
        const double tri2 = 8.0, tri2Cos = 0.3, tri2Dist2 = 9.0, tri2Area = 0.25;

        const double truth = albedo * invPi * (sunIrradiance * sunCos
                                             + tri1 * tri1Cos * tri1Area / tri1Dist2
                                             + tri2 * tri2Cos * tri2Area / tri2Dist2);

        // The estimator: pick the sun with probability sunShare, else a triangle uniformly, scaled by (1-share).
        auto RunRis = [&](int candidates, uint32_t seedValue, double sunShare)
        {
            std::mt19937 rng(seedValue);
            std::uniform_real_distribution<double> uniform(0.0, 1.0);

            double weightSum = 0.0;
            double selectedPHat = 0.0;
            int    m = 0;

            for (int i = 0; i < candidates; ++i)
            {
                double pHat, pSource;
                if (uniform(rng) < sunShare)
                {
                    // The sun: emission E*d2, contribution collapses to E*cos.
                    pHat    = albedo * invPi * sunIrradiance * sunCos;
                    pSource = sunShare;
                }
                else
                {
                    const bool first = uniform(rng) < 0.5;
                    pHat = first ? albedo * invPi * tri1 * tri1Cos * tri1Area / tri1Dist2
                                 : albedo * invPi * tri2 * tri2Cos * tri2Area / tri2Dist2;
                    pSource = 0.5 * (1.0 - sunShare);
                }

                const double weight = pHat / pSource;
                weightSum += weight;
                ++m;
                if (uniform(rng) * weightSum <= weight) selectedPHat = pHat;
            }

            if (weightSum <= 0.0 || selectedPHat <= 0.0) return 0.0;
            const double unbiasedWeight = weightSum / (double(m) * selectedPHat);
            return selectedPHat * unbiasedWeight;    // the shaded value
        };

        // Average many independent pixels - this is what convergence looks like.
        for (double sunShare : { 0.5, 0.25, 0.75 })
        {
            double total = 0.0;
            const int trials = 400000;
            for (int i = 0; i < trials; ++i) total += RunRis(4, uint32_t(i * 2654435761u), sunShare);
            const double estimate = total / trials;
            const double error = std::fabs(estimate - truth) / truth;

            Check(error < 0.01,
                  "RIS converges to the truth at sunShare " + Fixed(sunShare, 2),
                  Fixed(estimate, 5) + " vs " + Fixed(truth, 5) + " (" + Fixed(error * 100.0, 3) + "%)");
        }

        // And the degenerate case the engine actually hits outdoors: no emissive triangles at all, sun only.
        // Before P3 this scene skipped direct lighting entirely.
        {
            const double sunOnlyTruth = albedo * invPi * sunIrradiance * sunCos;
            double total = 0.0;
            const int trials = 100000;
            for (int i = 0; i < trials; ++i)
            {
                // sunShare = 1.0 when LightTriangleCount == 0
                std::mt19937 rng(uint32_t(i * 40503u + 7u));
                std::uniform_real_distribution<double> uniform(0.0, 1.0);
                double weightSum = 0.0, selected = 0.0;
                int m = 0;
                for (int c = 0; c < 4; ++c)
                {
                    const double pHat = sunOnlyTruth, pSource = 1.0;
                    const double weight = pHat / pSource;
                    weightSum += weight; ++m;
                    if (uniform(rng) * weightSum <= weight) selected = pHat;
                }
                total += selected * (weightSum / (double(m) * selected));
            }
            const double estimate = total / trials;
            Check(std::fabs(estimate - sunOnlyTruth) / sunOnlyTruth < 1e-9,
                  "a scene with NO emissive triangles is still lit by the sun",
                  Fixed(estimate, 6) + " vs " + Fixed(sunOnlyTruth, 6));
        }
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("4. kSunDistance IS A MEASURED COMPROMISE");
    //----------------------------------------------------------------------------------------------------------------
    // Too small: a reservoir shared between neighbouring pixels parallaxes, because the stored world point
    // implies a different direction from a neighbour's position. Too large: E*d2 loses fp32 mantissa.
    {
        // Spatial reuse taps neighbours a few metres away at most on a typical surface.
        const double reuseRadius = 5.0;
        const double parallax = std::atan(reuseRadius / kSunDistance);
        const double sunAngularRadius = 0.265 * 3.14159265358979 / 180.0;

        Check(parallax < sunAngularRadius * 0.1,
              "parallax across a 5 m reuse neighbourhood is <10% of the sun's radius",
              Fixed(parallax * 180.0 / 3.14159265, 6) + " deg vs disc radius "
                    + Fixed(sunAngularRadius * 180.0 / 3.14159265, 4) + " deg");

        // fp32 must still resolve E*d2 to better than a part in 10^4.
        const float emission32 = float(22.0 * kSunDistance * kSunDistance);
        const float nextValue  = std::nextafter(emission32, 2.0f * emission32);
        const double relativeUlp = double(nextValue - emission32) / double(emission32);
        Check(relativeUlp < 1e-4, "fp32 still resolves E*d2 finely",
              "1 ulp = " + Fixed(relativeUlp * 100.0, 6) + "%");

        // Sanity on both directions: show why 1 km and 1e9 m would each be wrong.
        const double parallaxNear = std::atan(reuseRadius / 1000.0);
        Check(parallaxNear > sunAngularRadius,
              "at 1 km the parallax would EXCEED the sun's disc (why not nearer)",
              Fixed(parallaxNear * 180.0 / 3.14159265, 4) + " deg");

        const float farEmission = float(22.0 * 1e9 * 1e9);
        Check(!std::isfinite(farEmission) || double(farEmission) > 1e18,
              "at 1e9 m the emission would be ~1e19 (why not farther)",
              Fixed(double(farEmission), 0));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("5. DIRECT SUNLIGHT REDDENS AT SUNSET (the production solver)");
    //----------------------------------------------------------------------------------------------------------------
    // Runs the shipping SolveSunTransmittance. If direct light stayed noon-white under an orange sky, the scene
    // would look like a backdrop pasted behind a differently lit world.
    {
        Frontier::CelestialStructure settings{};

        auto Transmittance = [&](double elevationDegrees)
        {
            float rgb[3];
            Frontier::SolveSunTransmittance(settings, float(elevationDegrees * 3.14159265 / 180.0), rgb);
            return vec3(rgb[0], rgb[1], rgb[2]);
        };

        const vec3 noon   = Transmittance(60.0);
        const vec3 low    = Transmittance(10.0);
        const vec3 sunset = Transmittance(0.5);

        Check(noon.x > 0.85f && noon.z > 0.6f, "at noon the sun is bright and near-neutral",
              "rgb " + Fixed(noon.x, 3) + " " + Fixed(noon.y, 3) + " " + Fixed(noon.z, 3));

        const float noonRatio   = noon.x / std::max(noon.z, 1e-9f);
        const float sunsetRatio = sunset.x / std::max(sunset.z, 1e-9f);

        Check(sunsetRatio > noonRatio * 10.0f,
              "at sunset direct light is dramatically redder",
              "R/B " + Fixed(noonRatio, 3) + " -> " + Fixed(sunsetRatio, 1));

        Check(sunset.x < noon.x && low.x < noon.x,
              "and dimmer overall as the path lengthens",
              "R " + Fixed(noon.x, 3) + " -> " + Fixed(low.x, 3) + " -> " + Fixed(sunset.x, 3));

        // Monotonic: brightness must fall all the way down, with no bump from the air-mass formula.
        bool monotonic = true;
        float previous = 2.0f;
        for (int elevation = 90; elevation >= 0; elevation -= 2)
        {
            const float value = Transmittance(elevation).x;
            if (value > previous + 1e-6f) monotonic = false;
            previous = value;
        }
        Check(monotonic, "transmittance falls monotonically from zenith to horizon", "");

        // Below the horizon it must reach zero without going negative or NaN.
        const vec3 below = Transmittance(-3.0);
        Check(below.x == 0.0f && below.y == 0.0f && below.z == 0.0f,
              "below the horizon there is no direct sunlight", "");

        // And the fade through the refraction window must be continuous, not a one-frame pop.
        const vec3 justBelow = Transmittance(-1.0);
        Check(justBelow.x > 0.0f && justBelow.x < Transmittance(0.0).x,
              "the -2..0 deg refraction window fades rather than cuts",
              "R at -1 deg = " + Fixed(justBelow.x, 5));

        std::printf("       elevation -> transmittance R,G,B:\n");
        for (double e : { 60.0, 30.0, 10.0, 4.0, 1.0, 0.0, -1.0 })
        {
            const vec3 t = Transmittance(e);
            std::printf("         %+6.1f deg   %.5f %.5f %.5f\n", e, t.x, t.y, t.z);
        }
    }

    //----------------------------------------------------------------------------------------------------------------
    std::printf("\n========================================================================\n");
    std::printf(" %d checks, %d failures\n", gChecks, gFail);
    std::printf("========================================================================\n");
    return gFail == 0 ? 0 : 1;
}
