//============================================================================================================================================
// 🎬 Scratchpad/CelestialShowcase.cpp — what the GPU would draw, computed on the CPU from the SAME SHADER TEXT
//============================================================================================================================================
// This answers "show me the sun and atmosphere" with an image whose every lighting value is produced by the
// shipping shader source, not by a C++ restatement of it.
//
// 🔴 THE DISTINCTION THAT MATTERS, AND WHICH THIS FILE GOT WRONG ONCE.
//
//    An earlier version hand-wrote SunDisc()/MoonDisc()/Sky() in C++ and called them "mirrors" of the shader.
//    That is a proof that agrees with itself: if CelestialMoonDisc in the shader were broken, the mirror would
//    still render a perfectly pleasant picture and report success. Useless.
//
//    Now Scratchpad/ExtractCelestialPort.sh lifts the ACTUAL TEXT of the shader's celestial block —
//    CelestialRecord, CelestialAtmosphereOf, CelestialObserver, CelestialSunDisc, CelestialMoonDisc,
//    CelestialSky — out of ReSTIRViewport.slang and compiles it as C++ through GlslShim.h. Edit the shader and
//    this image changes. That is the only version of this claim worth making.
//
//    The full chain, all production:
//      SolveCelestial            real almanac ephemeris at Benoni, for a real date and clock time
//      PackCelestialUniform      the exact bytes the engine uploads to binding 21
//      CelestialSky (extracted)  the shader's own sky, discs, flags and step budget
//      AtmosphereScatter.slang   the scattering integral it calls
//      RayGeneration.slang       the production pixel->ray mapping, including the Vulkan y-flip
//      SolveSunTransmittance     the reddening of direct sunlight
//      ExposureIntegrator        Celestial mode — the P4 F3 fix
//
//    What is NOT production, and cannot be here: the BVH and the BSDF stack. This harness intersects three
//    analytic spheres and a plane with a Lambertian response, because the engine's traversal needs a GPU. So
//    the LIGHTING is the engine's; the GEOMETRY and MATERIALS are a stand-in.
//
// ⚠️ THEREFORE: this is what the GPU would compute for this scene, evaluated on the CPU. It is not a screenshot
//    of Vulkan running. Identical maths, same source text, same inputs — but the Vulkan path itself is
//    unproven until someone runs it on hardware.
//
// Build (from repo root):
//   bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
//       Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g' Engine/Shaders/RayGeneration.slang > /tmp/RayGeneration.port.inc
//   g++ -std=c++20 -O2 -I Scratchpad -I . Scratchpad/CelestialShowcase.cpp \
//       Engine/DisplayPresentation/ExposureIntegrator.cpp -o /tmp/showcase

#include "GlslShim.h"

#include "Engine/DisplayPresentation/CelestialStructure.h"
#include "Engine/DisplayPresentation/CelestialSolver.h"
#include "Engine/DisplayPresentation/CelestialUniform.h"
#include "Engine/DisplayPresentation/ExposureIntegrator.h"

#define FRONTIER_CPU_PORT
#include "/tmp/AtmosphereScatter.port.inc"
#include "/tmp/RayGeneration.port.inc"

// The shader's celestial block reads `Celestial[0]`, a storage buffer. The extractor rewrites that to this
//    single record, which the harness fills from PackCelestialUniform.
struct CelestialRecord;
static CelestialRecord* gCelestialRecordPtr = nullptr;
#define gCelestialRecord (*gCelestialRecordPtr)

// 🔴 THE FLAG BITS COME FROM THE C++ HEADER, NOT FROM THE SHADER.
//    The extractor deliberately does not emit the shader's `#define kCelestialFlag*`. Binding the extracted
//    SHADER code to the ENGINE's constants means the two are forced to agree: if the shader ever renumbered a
//    bit, this render would visibly break instead of quietly diverging. CheckCelestialSolver already asserts
//    the six values match on both sides, so this is a second, executable check of the same property.
using Frontier::kCelestialFlagEnabled;
using Frontier::kCelestialFlagFog;
using Frontier::kCelestialFlagLocalFog;
using Frontier::kCelestialFlagLocalCloud;
using Frontier::kCelestialFlagMoon;
using Frontier::kCelestialFlagStars;

// 🔴 THE SHIPPING SHADER TEXT, COMPILED AS C++.
//    Overridable so the falsification gate can point at its own extraction without racing the default one.
#ifndef FRONTIER_SHOWCASE_PORT
#define FRONTIER_SHOWCASE_PORT "/tmp/CelestialPort.inc"
#endif
#include FRONTIER_SHOWCASE_PORT

#include <cstdio>
#include <cstring>
#include <cmath>
#include <vector>
#include <string>
#include <algorithm>
#include <random>

//------------------------------------------------------------------------------------------------------------------------
//                                      FILLING THE RECORD, AND THE ONE LOCAL ADDITION
//------------------------------------------------------------------------------------------------------------------------

// PackCelestialUniform writes a flat float array; the shader reads a struct of vec4s. They are the same 368
//    bytes, so the record is filled by a straight copy. If the two ever disagreed this would produce garbage —
//    which is the point of doing it this way rather than assigning field by field.
static CelestialRecord RecordFromUniform(const Frontier::CelestialUniform& Packed)
{
    static_assert(sizeof(CelestialRecord) == sizeof(Frontier::CelestialUniform),
                  "the shader's CelestialRecord and the CPU's CelestialUniform must be the same size");
    CelestialRecord record;
    std::memcpy(&record, &Packed, sizeof(record));
    return record;
}

// ⚠️ STARS ARE THE ONE THING HERE THAT IS NOT PRODUCTION CODE — P7 has not been written yet, so the shader has
//    no star function to extract. This is a placeholder so the night frames are not empty, and it is kept
//    visibly separate from everything above rather than blended in as though it shipped.
//
//    It is calibrated in RADIANCE, per unit solar irradiance, like everything else. An earlier version used raw
//    values near 1.0 against a night exposure gain of ~2.8e5 and rendered every star at 845 000x white.
#define kStarBrightRadiance 2.1e-6f

static vec3 PlaceholderStars(const CelestialRecord& sky, vec3 dir)
{
    if ((uint32_t(sky.ExposureAndFlags.w) & kCelestialFlagStars) == 0u) return vec3(0.0f, 0.0f, 0.0f);

    const float rotation = sky.StarsAndRotation.w;
    const float c = std::cos(-rotation), sn = std::sin(-rotation);
    const vec3 d(dir.x * c - dir.y * sn, dir.x * sn + dir.y * c, dir.z);
    if (d.z < -0.05f) return vec3(0.0f, 0.0f, 0.0f);

    const float cell = 420.0f;
    const int ix = int(std::floor(d.x * cell)), iy = int(std::floor(d.y * cell)), iz = int(std::floor(d.z * cell));
    uint32_t h = uint32_t(ix * 73856093) ^ uint32_t(iy * 19349663) ^ uint32_t(iz * 83492791);
    h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15;

    if (float(h & 0xFFFFu) / 65535.0f > 0.010f) return vec3(0.0f, 0.0f, 0.0f);

    const float mag = float((h >> 16) & 0xFFu) / 255.0f;
    const float brightness = sky.StarsAndRotation.x * kStarBrightRadiance * (0.03f + mag * mag);
    const vec3 tint = mag > 0.72f ? vec3(0.80f, 0.86f, 1.00f)
                    : mag > 0.34f ? vec3(1.00f, 0.98f, 0.94f)
                                  : vec3(1.00f, 0.80f, 0.62f);

    const float band = std::exp(-std::pow(std::fabs(d.z - 0.25f) * 3.4f, 2.0f)) * sky.MilkyWayAndMoonPhase.x;
    return tint * brightness + vec3(0.75f, 0.78f, 0.95f) * (band * kStarBrightRadiance * 0.08f);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    TOY SCENE
//------------------------------------------------------------------------------------------------------------------------

struct Sphere { vec3 Centre; float Radius; vec3 Albedo; };

// ⚠️ Placed in CAMERA-RELATIVE coordinates and rotated into the world each frame. The camera follows the sun's
//    azimuth so the disc is always in shot; with fixed world positions the spheres fell out of frame at every
//    hour except noon, and a showcase of sunlight with nothing for the sun to light is not much of a showcase.
static Sphere gSpheres[3] = {
    { vec3(-2.7f,  9.5f, 1.15f), 1.15f, vec3(0.72f, 0.26f, 0.20f) },
    { vec3( 0.2f,  7.6f, 0.78f), 0.78f, vec3(0.30f, 0.52f, 0.72f) },
    { vec3( 3.0f, 11.2f, 1.55f), 1.55f, vec3(0.80f, 0.70f, 0.32f) },
};

static void PlaceSpheresFacing(float azimuthRadians)
{
    static const Sphere local[3] = {
        { vec3(-2.7f,  9.5f, 1.15f), 1.15f, vec3(0.72f, 0.26f, 0.20f) },
        { vec3( 0.2f,  7.6f, 0.78f), 0.78f, vec3(0.30f, 0.52f, 0.72f) },
        { vec3( 3.0f, 11.2f, 1.55f), 1.55f, vec3(0.80f, 0.70f, 0.32f) },
    };
    const float c = std::cos(azimuthRadians), s = std::sin(azimuthRadians);
    for (int i = 0; i < 3; ++i)
    {
        const vec3 p = local[i].Centre;
        gSpheres[i].Centre = vec3(p.x * c + p.y * s, -p.x * s + p.y * c, p.z);
        gSpheres[i].Radius = local[i].Radius;
        gSpheres[i].Albedo = local[i].Albedo;
    }
}

static bool Trace(vec3 origin, vec3 dir, float& t, vec3& normal, vec3& albedo)
{
    bool hit = false; t = 1e30f;
    for (const Sphere& s : gSpheres)
    {
        const vec3 oc = origin - s.Centre;
        const float b = dot(oc, dir), c = dot(oc, oc) - s.Radius * s.Radius, disc = b * b - c;
        if (disc <= 0.0f) continue;
        const float x = -b - std::sqrt(disc);
        if (x > 1e-3f && x < t) { t = x; normal = normalize(origin + dir * x - s.Centre); albedo = s.Albedo; hit = true; }
    }
    // The ground is an infinite plane here, matching SkySpheresStructure's 60 km quad: the point of the scene
    //    is that the ground REACHES the horizon, so aerial perspective has kilometres to work over and the sky
    //    meets the land instead of meeting a void.
    if (dir.z < 0.0f)
    {
        const float x = -origin.z / dir.z;
        if (x > 1e-3f && x < t) { t = x; normal = vec3(0.0f, 0.0f, 1.0f); albedo = vec3(0.33f, 0.31f, 0.28f); hit = true; }
    }
    return hit;
}

static bool Occluded(vec3 origin, vec3 dir)
{
    for (const Sphere& s : gSpheres)
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
    const int   flareTier = argc > 6 ? std::atoi(argv[6]) : -1;   // -1 = leave the default

    //---------------------------------------------------------------------------------------------------------
    // 🔴 THE PRODUCTION CHAIN. Settings -> real ephemeris -> the actual GPU record -> read back as the shader.
    //---------------------------------------------------------------------------------------------------------
    Frontier::CelestialStructure settings{};          // defaults: Benoni, -26.19, +28.32, UTC+2, 2026-09-13
    settings.Observation.LocalHours = hours;
    if (flareTier >= 0)
        Frontier::ApplyLensFlareStyle(settings.LensFlare,
                                      static_cast<Frontier::LensFlareStyleCategory>(flareTier));

    const Frontier::CelestialSolution solution = Frontier::SolveCelestial(settings);

    Frontier::CelestialUniform record{};
    Frontier::PackCelestialUniform(settings, solution, /*wallSeconds*/ 0.0, record);

    // The shader's own record type, filled from the exact bytes the engine uploads.
    CelestialRecord sky = RecordFromUniform(record);
    gCelestialRecordPtr = &sky;

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
    //    ⚠️ WAS 7000, WHICH BLEW THE SKY OUT. Measured at 17:00 the sky 0.4 deg from the sun reached ACES 1.000
    //    — pure white — with the sun's own disc clipping to the same value, so the sun was invisible against a
    //    white sky and NO glare term could have helped. A photographer shooting toward the sun stops down so the
    //    sky holds detail and only the sun clips. 800 does that: near-sun sky 0.87, mid sky 0.78, lit ground
    //    0.09..0.44 across the day. This is the single constant that made D3 look like a missing feature when it
    //    was an exposure error.
    const float kUnitReconciliation = 800.0f;
    const float exposure = exposureIntegrator.QueryExposure() * kUnitReconciliation;

    //---------------------------------------------------------------------------------------------------------
    // 🔴 AIM THE CAMERA AT THE SUN'S AZIMUTH, rather than at a fixed compass bearing.
    //
    //    The first version faced a fixed north-east. At noon that put the sun 63.7 degrees off-axis and at
    //    sunset 275 degrees away — so the sun disc was never in shot, and a falsification test that ZEROED the
    //    disc in the shader changed literally zero bytes of the render. The test was right to fire: an image
    //    that cannot show the disc cannot be evidence the disc works.
    //
    //    Following the azimuth means every frame actually contains the thing being demonstrated. A slight
    //    offset keeps the sun off dead-centre so the sky gradient either side of it stays visible.
    const float sunAzimuth = solution.SunAzimuthDegrees * 3.14159265f / 180.0f;
    const float viewAzimuth = sunAzimuth + 0.16f;

    CameraBasis camera;
    camera.Origin     = vec3(0.0f, 0.0f, 1.75f);
    camera.Forward    = normalize(vec3(std::sin(viewAzimuth), std::cos(viewAzimuth), -0.045f));
    camera.Right      = normalize(cross(camera.Forward, vec3(0.0f, 0.0f, 1.0f)));
    camera.Up         = normalize(cross(camera.Right, camera.Forward));
    camera.TanHalfFov = std::tan(29.0f * 3.14159265f / 180.0f);
    camera.Aspect     = float(width) / float(height);

    PlaceSpheresFacing(viewAzimuth);

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
            bool isSurfaceHit = true;

            if (Trace(camera.Origin, dir, t, normal, albedo))
            {
                const vec3 hit = camera.Origin + dir * t;

                // ── Direct sun, sampled across its DISC: this is the P3 reservoir light, and sampling the disc
                //    rather than the centre is what gives the shadow a real penumbra.
                const vec3 sunDirection = sky.SunDirectionAndCosRadius.xyz();
                if (sunDirection.z > 0.0f)
                {
                    // P3's cone sample across the sun's DISC — this is what gives the shadow a penumbra.
                    const float cosRadius = sky.SunDirectionAndCosRadius.w;
                    const float u1 = uniform(rng), u2 = uniform(rng);
                    const float cosTheta = cosRadius + (1.0f - cosRadius) * u1;
                    const float sinTheta = std::sqrt(std::max(0.0f, 1.0f - cosTheta * cosTheta));
                    const float phi = 6.2831853f * u2;
                    const vec3 tangent = normalize(std::fabs(sunDirection.z) < 0.99f
                                                 ? cross(vec3(0.0f, 0.0f, 1.0f), sunDirection)
                                                 : vec3(1.0f, 0.0f, 0.0f));
                    const vec3 bitangent = cross(sunDirection, tangent);
                    const vec3 toSun = normalize(sunDirection * cosTheta
                                               + tangent * (sinTheta * std::cos(phi))
                                               + bitangent * (sinTheta * std::sin(phi)));

                    const float cosSurface = std::max(dot(normal, toSun), 0.0f);
                    if (cosSurface > 0.0f && !Occluded(hit + normal * 1e-3f, toSun))
                    {
                        // 🔴 SunTransmittance is why the light warms at dusk: the air is filtering it.
                        colour = colour + albedo * (1.0f / 3.14159265f)
                                        * sky.SunIrradianceAndScale.xyz() * sky.SunTransmittance.xyz()
                                        * cosSurface;
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
                const vec3 moonDirection = sky.MoonDirectionAndCosRadius.xyz();
                if (moonDirection.z > 0.0f && sunDirection.z < 0.02f)
                {
                    const float cosSurface = std::max(dot(normal, moonDirection), 0.0f);
                    if (cosSurface > 0.0f && !Occluded(hit + normal * 1e-3f, moonDirection))
                    {
                        const float moonSolidAngle = 6.2831853f * (1.0f - sky.MoonDirectionAndCosRadius.w);
                        const float phase = std::clamp(sky.MilkyWayAndMoonPhase.y, 0.0f, 1.0f);
                        colour = colour + albedo * (1.0f / 3.14159265f)
                                        * sky.MoonRadianceAndEarthshine.xyz() * moonSolidAngle
                                        * (phase * phase) * cosSurface;
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
                {
                    // 🔴 P2b, and this is the SHADER'S OWN CelestialSky — discs excluded, as on the bounce path.
                    colour = colour + albedo * CelestialSky(sky, hit, bounce, false);
                }
            }
            else
            {
                isSurfaceHit = false;
                // 🔴 THE PRIMARY MISS, THROUGH THE SHADER'S OWN FUNCTION — sky, sun disc and moon disc, exactly
                //    as the kernel composites them. Stars are added separately only because P7 has not landed.
                colour = CelestialSky(sky, camera.Origin, dir, true) + PlaceholderStars(sky, dir);

                // 🔴 The lens flare, from the shader's own functions. Occlusion is 1 on a miss by definition.
                colour = colour + CelestialLensFlare(sky, dir, camera.Forward, camera.Right, camera.Up,
                                                     sky.SunTransmittance.xyz(), 1.0f);
            }

            // 🔴 AERIAL PERSPECTIVE, through the shader's own function. Surface pixels only — the sky is
            //    already the full integral and must not be hazed a second time.
            if (isSurfaceHit)
                colour = CelestialAerialPerspective(sky, camera.Origin, camera.Origin + dir * t, colour);

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
