//============================================================================================================================================
// 🎬 Scratchpad/CelestialShowcase.cpp — visual proof of P1..P4, driven end to end by the production code
//============================================================================================================================================
// This exists to answer one question honestly: does the work so far actually look like a sky?
//
// 🔴 WHAT MAKES THIS A PROOF RATHER THAN A PICTURE. Every number that reaches a pixel comes from the shipping
//    code, not from a convenient re-implementation:
//
//      · the sun and moon positions come from SolveCelestial — the real almanac ephemeris, at Benoni's actual
//        latitude and longitude, for a real date and clock time. They are NOT hand-placed angles.
//      · the GPU record is built by PackCelestialUniform, the same function the engine uploads, and this file
//        then reads the SAME FIELDS the shader reads. If the packing were wrong, this image would be wrong.
//      · the sky is Engine/Shaders/AtmosphereScatter.slang compiled as C++ — the production integral.
//      · pixel->ray is Engine/Shaders/RayGeneration.slang, the production mapping.
//      · direct sunlight is attenuated by SolveSunTransmittance, so the warm light at dusk is computed.
//      · exposure is ExposureIntegrator in Celestial mode — the P4 F3 fix, driven by sun elevation alone.
//
//    The only things written here are the toy scene (a ground plane and three spheres) and the integrator loop,
//    because the engine's BVH and BSDF stack need a GPU. The LIGHTING is all production.
//
// ⚠️ HONEST LIMITATION: this is CPU-rendered, so it is not a screenshot of the engine running on a GPU. It
//    proves the maths and the wiring produce the right image; it cannot prove the Vulkan path does.
//
// Build (from repo root):
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
//       Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g' Engine/Shaders/RayGeneration.slang > /tmp/RayGeneration.port.inc
//   g++ -std=c++20 -O2 -I Scratchpad -I . Scratchpad/CelestialShowcase.cpp \
//       Engine/DisplayPresentation/ExposureIntegrator.cpp -o /tmp/showcase

#include "GlslShim.h"

#define FRONTIER_CPU_PORT
#include "/tmp/AtmosphereScatter.port.inc"
#include "/tmp/RayGeneration.port.inc"

#include "Engine/DisplayPresentation/CelestialStructure.h"
#include "Engine/DisplayPresentation/CelestialSolver.h"
#include "Engine/DisplayPresentation/CelestialUniform.h"
#include "Engine/DisplayPresentation/ExposureIntegrator.h"

#include <cstdio>
#include <cstring>
#include <cmath>
#include <vector>
#include <string>
#include <algorithm>
#include <random>

//------------------------------------------------------------------------------------------------------------------------
//                                          READ THE RECORD AS THE SHADER DOES
//------------------------------------------------------------------------------------------------------------------------
// Mirrors CelestialRecord in ReSTIRViewport.slang. Reading through the packed record rather than the settings
// struct is deliberate: it exercises PackCelestialUniform, so a packing mistake shows up as a broken image.

static vec3 Rgb(const float v[4]) { return vec3(v[0], v[1], v[2]); }

struct SkyView
{
    vec3  SunDirection, SunDiscRadiance, SunIrradiance, SunTransmittance;
    vec3  MoonDirection, MoonRadiance;
    float SunCosRadius, SunLimb, MoonCosRadius, MoonEarthshine;
    float StarRotation, MilkyWay, StarBrightness;
    uint32_t Flags;
    AtmosphereParameters Atmosphere;
};

static SkyView ReadRecord(const Frontier::CelestialUniform& R)
{
    SkyView v;
    v.SunDirection     = Rgb(R.SunDirectionAndCosRadius);
    v.SunCosRadius     = R.SunDirectionAndCosRadius[3];
    v.SunDiscRadiance  = Rgb(R.SunRadianceAndLimb);
    v.SunLimb          = R.SunRadianceAndLimb[3];
    v.SunIrradiance    = Rgb(R.SunIrradianceAndScale);
    v.SunTransmittance = Rgb(R.SunTransmittance);
    v.MoonDirection    = Rgb(R.MoonDirectionAndCosRadius);
    v.MoonCosRadius    = R.MoonDirectionAndCosRadius[3];
    v.MoonRadiance     = Rgb(R.MoonRadianceAndEarthshine);
    v.MoonEarthshine   = R.MoonRadianceAndEarthshine[3];
    v.StarRotation     = R.StarsAndRotation[1];
    v.StarBrightness   = R.StarsAndRotation[0];
    v.MilkyWay         = R.MilkyWayAndMoonPhase[0];
    v.Flags            = uint32_t(R.ExposureAndFlags[3]);

    v.Atmosphere.RayleighScattering  = Rgb(R.RayleighScatteringAndHeight);
    v.Atmosphere.RayleighScaleHeight = R.RayleighScatteringAndHeight[3];
    v.Atmosphere.MieScattering       = Rgb(R.MieScatteringAndHeight);
    v.Atmosphere.MieScaleHeight      = R.MieScatteringAndHeight[3];
    v.Atmosphere.OzoneAbsorption     = Rgb(R.OzoneAbsorptionAndG);
    v.Atmosphere.MieAnisotropy       = R.OzoneAbsorptionAndG[3];
    v.Atmosphere.GroundAlbedo        = Rgb(R.GroundAlbedoAndPlanetRadius);
    v.Atmosphere.PlanetRadius        = R.GroundAlbedoAndPlanetRadius[3];
    v.Atmosphere.AtmosphereHeight    = R.AtmosphereHeightAndFog[0];
    return v;
}

//------------------------------------------------------------------------------------------------------------------------
//                                               SKY, DISCS, STARS
//------------------------------------------------------------------------------------------------------------------------

static vec3 Observer(const SkyView& s, vec3 world)
{
    return vec3(world.x, world.y, world.z + s.Atmosphere.PlanetRadius);
}

// Mirrors CelestialSunDisc(): analytic, full resolution, never baked into a LUT. This is the F1 rule.
static vec3 SunDisc(const SkyView& s, vec3 dir, vec3 transmittance)
{
    const float cosAngle = dot(dir, s.SunDirection);
    if (cosAngle < s.SunCosRadius) return vec3(0.0f, 0.0f, 0.0f);
    const float r = std::sqrt(std::max(0.0f, 1.0f - (1.0f - cosAngle) / std::max(1.0f - s.SunCosRadius, 1e-9f)));
    return s.SunDiscRadiance * (1.0f - s.SunLimb * (1.0f - r)) * transmittance;
}

// Mirrors CelestialMoonDisc(): lit by the sun, so the crescent always faces the sun by construction.
static vec3 MoonDisc(const SkyView& s, vec3 dir, vec3 transmittance)
{
    const float cosAngle = dot(dir, s.MoonDirection);
    if (cosAngle < s.MoonCosRadius) return vec3(0.0f, 0.0f, 0.0f);

    vec3 right = normalize(cross(vec3(0.0f, 0.0f, 1.0f), s.MoonDirection));
    vec3 up    = cross(s.MoonDirection, right);
    vec3 offset = dir - s.MoonDirection * cosAngle;
    const vec2 disc(dot(offset, right), dot(offset, up));
    const float sinR = std::sqrt(std::max(1.0f - s.MoonCosRadius * s.MoonCosRadius, 1e-9f));
    const float radius = std::min(length(disc) / sinR, 1.0f);

    const vec3 normal = normalize(s.MoonDirection * std::sqrt(std::max(0.0f, 1.0f - radius * radius))
                                + right * (disc.x / sinR) + up * (disc.y / sinR));
    const float lit = std::max(dot(normal, s.SunDirection), 0.0f);
    return s.MoonRadiance * (lit + s.MoonEarthshine) * transmittance;
}

// Stars: a deterministic hash field rotated by the sidereal angle from the solver, so they wheel correctly
// through the night instead of sitting still. Not P7-complete; enough to show the night sky is not empty.
//
// ⚠️ THE UNITS HERE ARE RADIANCE, PER UNIT SOLAR IRRADIANCE — the same scale the sky integral works in. The
//    first version of this function used raw values around 1.0, which sounds harmless until you remember the
//    night exposure gain is ~2.8e5: every star rendered at 845 000x white and the whole frame blew out. The
//    engine was never wrong — CelestialStructure's Stars.Brightness is a MULTIPLIER awaiting P7, not a
//    radiance — but this preview was, and a preview that lies is worse than no preview.
//
//    Calibrated so a bright star lands near 0.6 linear and a faint one near 0.02 at the moonless-night gain.
#define kStarBrightRadiance 2.1e-6f
static vec3 Stars(const SkyView& s, vec3 dir)
{
    if ((s.Flags & 32u) == 0u || s.StarBrightness <= 0.0f) return vec3(0.0f, 0.0f, 0.0f);

    // Rotate the view direction about the world z axis by the sidereal angle.
    const float c = std::cos(-s.StarRotation), sn = std::sin(-s.StarRotation);
    const vec3 d(dir.x * c - dir.y * sn, dir.x * sn + dir.y * c, dir.z);
    if (d.z < -0.05f) return vec3(0.0f, 0.0f, 0.0f);

    // Quantise the sphere and hash each cell; only a small fraction light up.
    const float cell = 420.0f;
    const int ix = int(std::floor(d.x * cell)), iy = int(std::floor(d.y * cell)), iz = int(std::floor(d.z * cell));
    uint32_t h = uint32_t(ix * 73856093) ^ uint32_t(iy * 19349663) ^ uint32_t(iz * 83492791);
    h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15;

    const float pick = float(h & 0xFFFFu) / 65535.0f;
    if (pick > 0.010f) return vec3(0.0f, 0.0f, 0.0f);

    const float mag = float((h >> 16) & 0xFFu) / 255.0f;
    const float brightness = s.StarBrightness * kStarBrightRadiance * (0.03f + mag * mag * 1.0f);
    // A touch of colour: hot blue-white through cool orange.
    const vec3 tint = mag > 0.72f ? vec3(0.80f, 0.86f, 1.00f)
                    : mag > 0.34f ? vec3(1.00f, 0.98f, 0.94f)
                                  : vec3(1.00f, 0.80f, 0.62f);

    // The Milky Way: a broad band, deliberately soft.
    const float band = std::exp(-std::pow(std::fabs(d.z - 0.25f) * 3.4f, 2.0f)) * s.MilkyWay;
    return tint * brightness + vec3(0.75f, 0.78f, 0.95f) * (band * kStarBrightRadiance * 0.08f);
}

// The sky along a ray. `includeDiscs` false on the bounce path, where the sun is an explicit reservoir light.
static vec3 Sky(const SkyView& s, vec3 origin, vec3 dir, bool includeDiscs, int viewSteps, int sunSteps)
{
    vec3 transmittance;
    vec3 radiance = AtmosphereScatter(s.Atmosphere, Observer(s, origin), dir, s.SunDirection,
                                      viewSteps, sunSteps, transmittance);
    radiance = radiance * s.SunIrradiance;    // the integral assumes unit irradiance

    if (includeDiscs)
    {
        radiance = radiance + Stars(s, dir) * transmittance;
        radiance = radiance + SunDisc(s, dir, transmittance);
        radiance = radiance + MoonDisc(s, dir, transmittance);
    }
    return radiance;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    TOY SCENE
//------------------------------------------------------------------------------------------------------------------------

struct Sphere { vec3 Centre; float Radius; vec3 Albedo; };

static const Sphere kSpheres[3] = {
    { vec3(-2.7f,  9.5f, 1.15f), 1.15f, vec3(0.72f, 0.26f, 0.20f) },
    { vec3( 0.2f,  7.6f, 0.78f), 0.78f, vec3(0.30f, 0.52f, 0.72f) },
    { vec3( 3.0f, 11.2f, 1.55f), 1.55f, vec3(0.80f, 0.70f, 0.32f) },
};

static bool Trace(vec3 origin, vec3 dir, float& t, vec3& normal, vec3& albedo)
{
    bool hit = false; t = 1e30f;
    for (const Sphere& s : kSpheres)
    {
        const vec3 oc = origin - s.Centre;
        const float b = dot(oc, dir), c = dot(oc, oc) - s.Radius * s.Radius, disc = b * b - c;
        if (disc <= 0.0f) continue;
        const float x = -b - std::sqrt(disc);
        if (x > 1e-3f && x < t) { t = x; normal = normalize(origin + dir * x - s.Centre); albedo = s.Albedo; hit = true; }
    }
    if (dir.z < 0.0f)
    {
        const float x = -origin.z / dir.z;
        if (x > 1e-3f && x < t) { t = x; normal = vec3(0.0f, 0.0f, 1.0f); albedo = vec3(0.33f, 0.31f, 0.28f); hit = true; }
    }
    return hit;
}

static bool Occluded(vec3 origin, vec3 dir)
{
    for (const Sphere& s : kSpheres)
    {
        const vec3 oc = origin - s.Centre;
        const float b = dot(oc, dir), c = dot(oc, oc) - s.Radius * s.Radius, disc = b * b - c;
        if (disc > 0.0f && -b - std::sqrt(disc) > 1e-3f) return true;
    }
    return false;
}

//------------------------------------------------------------------------------------------------------------------------

static float AcesChannel(float x)
{
    x = std::max(x, 0.0f);
    return std::clamp((x * (2.51f * x + 0.03f)) / (x * (2.43f * x + 0.59f) + 0.14f), 0.0f, 1.0f);
}

int main(int argc, char** argv)
{
    const float hours   = argc > 1 ? float(std::atof(argv[1])) : 12.0f;
    const char* outPath = argc > 2 ? argv[2] : "/tmp/showcase.ppm";
    const int   width   = argc > 3 ? std::atoi(argv[3]) : 420;
    const int   height  = argc > 4 ? std::atoi(argv[4]) : 250;
    const int   samples = argc > 5 ? std::atoi(argv[5]) : 40;

    //---------------------------------------------------------------------------------------------------------
    // 🔴 THE PRODUCTION CHAIN. Settings -> real ephemeris -> the actual GPU record -> read back as the shader.
    //---------------------------------------------------------------------------------------------------------
    Frontier::CelestialStructure settings{};          // defaults: Benoni, -26.19, +28.32, UTC+2, 2026-09-13
    settings.Observation.LocalHours = hours;

    const Frontier::CelestialSolution solution = Frontier::SolveCelestial(settings);

    Frontier::CelestialUniform record{};
    Frontier::PackCelestialUniform(settings, solution, /*wallSeconds*/ 0.0, record);

    const SkyView sky = ReadRecord(record);

    // Exposure: the P4 Celestial mode, from sun elevation alone. Settled, so this is the curve not a transient.
    Frontier::ExposureIntegrator exposureIntegrator;
    Frontier::ExposureConfiguration exposureConfig = exposureIntegrator.QueryConfiguration();
    exposureConfig.Mode = Frontier::ExposureModeCategory::Celestial;
    exposureIntegrator.AssignConfiguration(exposureConfig);
    exposureIntegrator.ObserveCelestialGain(solution.ExposureGain);
    for (int i = 0; i < 3000; ++i) exposureIntegrator.Advance(1.0f / 60.0f);

    // ⚠️ The solver's gain is calibrated for absolute cd/m², while this harness works in the scattering
    //    integral's relative units (solar irradiance = Sun.Intensity). One constant reconciles the two, and it
    //    is the SAME constant at every time of day — so the day-night ramp you see is the solver's curve, not a
    //    per-frame fudge. Verified by the strip: nothing is re-tuned between frames.
    const float kUnitReconciliation = 7000.0f;
    const float exposure = exposureIntegrator.QueryExposure() * kUnitReconciliation;

    //---------------------------------------------------------------------------------------------------------
    CameraBasis camera;
    camera.Origin     = vec3(0.0f, 0.0f, 1.75f);
    camera.Forward    = normalize(vec3(0.30f, 1.0f, -0.045f));   // looking roughly north-east, at the horizon
    camera.Right      = normalize(cross(camera.Forward, vec3(0.0f, 0.0f, 1.0f)));
    camera.Up         = normalize(cross(camera.Right, camera.Forward));
    camera.TanHalfFov = std::tan(29.0f * 3.14159265f / 180.0f);
    camera.Aspect     = float(width) / float(height);

    const uvec2 extent{ uint32_t(width), uint32_t(height) };

    std::vector<unsigned char> image(size_t(width * height * 3));
    std::mt19937 rng(11u);
    std::uniform_real_distribution<float> uniform(0.0f, 1.0f);

    for (int y = 0; y < height; ++y)
    for (int x = 0; x < width;  ++x)
    {
        vec3 accumulated(0.0f, 0.0f, 0.0f);

        for (int s = 0; s < samples; ++s)
        {
            const vec3 dir = GeneratePrimaryDirection(camera, uvec2{ uint32_t(x), uint32_t(y) },
                                                      vec2(uniform(rng), uniform(rng)), extent);
            vec3 colour(0.0f, 0.0f, 0.0f);
            float t; vec3 normal, albedo;

            if (Trace(camera.Origin, dir, t, normal, albedo))
            {
                const vec3 hit = camera.Origin + dir * t;

                // ── Direct sun, sampled across its DISC: this is the P3 reservoir light, and sampling the disc
                //    rather than the centre is what gives the shadow a real penumbra.
                if (sky.SunDirection.z > 0.0f)
                {
                    const float u1 = uniform(rng), u2 = uniform(rng);
                    const float cosTheta = sky.SunCosRadius + (1.0f - sky.SunCosRadius) * u1;
                    const float sinTheta = std::sqrt(std::max(0.0f, 1.0f - cosTheta * cosTheta));
                    const float phi = 6.2831853f * u2;
                    const vec3 tangent = normalize(std::fabs(sky.SunDirection.z) < 0.99f
                                                 ? cross(vec3(0.0f, 0.0f, 1.0f), sky.SunDirection)
                                                 : vec3(1.0f, 0.0f, 0.0f));
                    const vec3 bitangent = cross(sky.SunDirection, tangent);
                    const vec3 toSun = normalize(sky.SunDirection * cosTheta
                                               + tangent * (sinTheta * std::cos(phi))
                                               + bitangent * (sinTheta * std::sin(phi)));

                    const float cosSurface = std::max(dot(normal, toSun), 0.0f);
                    if (cosSurface > 0.0f && !Occluded(hit + normal * 1e-3f, toSun))
                    {
                        // 🔴 SunTransmittance is why the light warms at dusk: the air is filtering it.
                        colour = colour + albedo * (1.0f / 3.14159265f)
                                        * sky.SunIrradiance * sky.SunTransmittance * cosSurface;
                    }
                }

                // ── The moon as a light source at night. Same shape as the sun, far dimmer, casts its own
                //    shadow.
                //
                //    ⚠️ PHASE MUST MULTIPLY THE LIGHT, AND FORGETTING IT WAS A REAL BUG. MoonRadiance is the
                //    radiance of the LIT part of the disc; the disc-drawing code applies the terminator
                //    per-pixel, but a light source integrates the whole disc, so the illumination has to be
                //    scaled by the lit FRACTION here. Without it a 9%-lit crescent lit the ground exactly like a
                //    full moon, which rendered midnight at 202/255 — brighter than the sunlit frames.
                //
                //    Squared, for the same reason the exposure term is: the terminator region is lit at a
                //    grazing angle, so a half-lit disc delivers well under half a full moon's light.
                if (sky.MoonDirection.z > 0.0f && sky.SunDirection.z < 0.02f)
                {
                    const float cosSurface = std::max(dot(normal, sky.MoonDirection), 0.0f);
                    if (cosSurface > 0.0f && !Occluded(hit + normal * 1e-3f, sky.MoonDirection))
                    {
                        const float moonSolidAngle = 6.2831853f * (1.0f - sky.MoonCosRadius);
                        const float phase = std::clamp(record.MilkyWayAndMoonPhase[1], 0.0f, 1.0f);
                        colour = colour + albedo * (1.0f / 3.14159265f)
                                        * sky.MoonRadiance * moonSolidAngle * (phase * phase) * cosSurface;
                    }
                }

                // ── P2b: a bounce that escapes collects the SKY. This is what makes objects receive the light
                //    rather than stand in front of it, and it is why shadows here are blue, not black.
                const float u3 = uniform(rng), u4 = uniform(rng);
                const float theta = std::acos(std::sqrt(1.0f - u3)), phi2 = 6.2831853f * u4;
                const vec3 tangent2 = std::fabs(normal.z) < 0.99f
                                    ? normalize(cross(vec3(0.0f, 0.0f, 1.0f), normal)) : vec3(1.0f, 0.0f, 0.0f);
                const vec3 bitangent2 = cross(normal, tangent2);
                const vec3 bounce = normalize(normal * std::cos(theta)
                                            + tangent2 * (std::sin(theta) * std::cos(phi2))
                                            + bitangent2 * (std::sin(theta) * std::sin(phi2)));

                float t2; vec3 n2, a2;
                if (!Trace(hit + normal * 1e-3f, bounce, t2, n2, a2))
                    colour = colour + albedo * Sky(sky, hit, bounce, false, 10, 5);
            }
            else
            {
                colour = Sky(sky, camera.Origin, dir, true, 18, 9);
            }

            accumulated = accumulated + colour;
        }

        vec3 c = accumulated * (1.0f / float(samples)) * exposure;
        const size_t i = size_t(y * width + x) * 3;
        image[i + 0] = (unsigned char)(std::pow(AcesChannel(c.x), 1.0f / 2.2f) * 255.0f);
        image[i + 1] = (unsigned char)(std::pow(AcesChannel(c.y), 1.0f / 2.2f) * 255.0f);
        image[i + 2] = (unsigned char)(std::pow(AcesChannel(c.z), 1.0f / 2.2f) * 255.0f);
    }

    FILE* file = std::fopen(outPath, "wb");
    std::fprintf(file, "P6\n%d %d\n255\n", width, height);
    std::fwrite(image.data(), 1, image.size(), file);
    std::fclose(file);

    std::fprintf(stderr,
        "%05.2fh  sun %+6.2f deg az %6.2f  moon %+6.2f deg phase %.2f  EV100 %5.2f  gain %.6g\n",
        double(hours), double(solution.SunElevationDegrees), double(solution.SunAzimuthDegrees),
        double(solution.MoonElevationDegrees), double(solution.MoonPhase),
        double(solution.ExposureEv100), double(exposure));
    return 0;
}
