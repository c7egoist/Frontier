//============================================================================================================================================
// 📷 Scratchpad/LensFlareTest.cpp — executable proof of the sultanaladin HTML lensFlare() port
//============================================================================================================================================
// The previous angular flare was rejected. This harness extracts the shipping ReSTIRViewport celestial block and
// exercises the reference page's screen-space ghosts, halo ring, streak, aperture burst and visibility gate.

#include "GlslShim.h"
#include "Engine/DisplayPresentation/CelestialStructure.h"
#include "Engine/DisplayPresentation/CelestialSolver.h"
#include "Engine/DisplayPresentation/CelestialUniform.h"

#include <cstdio>
#include <cstring>
#include <cmath>
#include <string>

struct CelestialRecord;
static CelestialRecord* gCelestialRecordPtr = nullptr;
#define gCelestialRecord (*gCelestialRecordPtr)
using Frontier::kCelestialFlagEnabled;
using Frontier::kCelestialFlagMoon;
using Frontier::kCelestialFlagStars;
using Frontier::kCelestialFlagFog;
using Frontier::kCelestialFlagLocalFog;
using Frontier::kCelestialFlagLocalCloud;

#define FRONTIER_CPU_PORT
#include "/tmp/AtmosphereScatter.port.inc"
#include "/tmp/CelestialPort.inc"

static int gChecks = 0, gFail = 0;
static void Check(bool ok, const std::string& label, const std::string& detail = {})
{
    ++gChecks;
    if (!ok) ++gFail;
    std::printf("  %-4s %-54s %s\n", ok ? "PASS" : "FAIL", label.c_str(), detail.c_str());
}
static float Luma(vec3 c) { return 0.2126f * c.x + 0.7152f * c.y + 0.0722f * c.z; }

static CelestialRecord BuildRecord(const Frontier::CelestialStructure& settings)
{
    const Frontier::CelestialSolution solution = Frontier::SolveCelestial(settings);
    Frontier::CelestialUniform packed{};
    Frontier::PackCelestialUniform(settings, solution, 0.0, packed);
    CelestialRecord record;
    std::memcpy(&record, &packed, sizeof(record));
    return record;
}

static vec3 gSun, gForward, gRight, gUp;
static constexpr float kTanHalfFov = 0.55f;
static vec3 ScreenOffset(float x, float y)
{
    // x/y are reference-page screen uv units, not world degrees.
    return normalize(gForward + gRight * (x * kTanHalfFov) + gUp * (y * kTanHalfFov));
}

int main()
{
    std::printf("========================================================================\n");
    std::printf(" HTML LENS FLARE - ghosts, halo, streak, burst and screen visibility\n");
    std::printf("========================================================================\n");

    Frontier::CelestialStructure settings{};
    settings.Observation.LocalHours = 17.0f;
    CelestialRecord record = BuildRecord(settings);
    gCelestialRecordPtr = &record;
    gSun = record.SunDirectionAndCosRadius.xyz();
    gForward = gSun;
    gRight = normalize(cross(gSun, vec3(0.0f, 0.0f, 1.0f)));
    gUp = normalize(cross(gRight, gSun));
    const vec3 white(1.0f);

    std::printf("\n-- reference composite -------------------------------------------------------\n");
    const vec3 centre = CelestialLensFlare(record, ScreenOffset(0.0f, 0.0f), gForward, gRight, gUp,
                                           white, 1.0f, kTanHalfFov);
    const vec3 streak = CelestialLensFlare(record, ScreenOffset(0.28f, 0.0f), gForward, gRight, gUp,
                                           white, 1.0f, kTanHalfFov);
    const vec3 vertical = CelestialLensFlare(record, ScreenOffset(0.0f, 0.28f), gForward, gRight, gUp,
                                             white, 1.0f, kTanHalfFov);
    Check(Luma(centre) > 0.0f, "the reference composite produces centre light", "luma " + std::to_string(Luma(centre)));
    Check(Luma(streak) > 0.0f, "the reference streak responds off-axis", "luma " + std::to_string(Luma(streak)));
    Check(Luma(streak) > Luma(vertical), "the reference streak is anisotropic", "horizontal > vertical");

    std::printf("\n-- visibility and settings ----------------------------------------------------\n");
    const vec3 hidden = CelestialLensFlare(record, ScreenOffset(0.28f, 0.0f), gForward, gRight, gUp,
                                           white, 0.0f, kTanHalfFov);
    Check(Luma(hidden) == 0.0f, "occlusion removes the lens composite", "");

    Frontier::CelestialStructure disabled = settings;
    disabled.LensFlare.Enabled = false;
    CelestialRecord disabledRecord = BuildRecord(disabled);
    Check(uint32_t(disabledRecord.FlareStreakAndFlags.w) == 0u, "disabled flare clears the packed mask", "");
    Check(Luma(CelestialLensFlare(disabledRecord, ScreenOffset(0.28f, 0.0f), gForward, gRight, gUp,
                                 white, 1.0f, kTanHalfFov)) == 0.0f,
          "disabled flare produces no pixels", "");

    Frontier::CelestialStructure belowHorizon = settings;
    belowHorizon.Observation.LocalHours = 5.0f;
    CelestialRecord nightRecord = BuildRecord(belowHorizon);
    Check(Luma(CelestialLensFlare(nightRecord, ScreenOffset(0.28f, 0.0f), gForward, gRight, gUp,
                                  white, 1.0f, kTanHalfFov)) == 0.0f,
          "below-horizon sun cannot create a flare", "");

    // The screen gate is the key distinction from an atmosphere term: move the sun outside the frame and the
    // same ray-space source contributes nothing, even though the camera still faces the sky.
    vec3 offAxisForward = normalize(gSun + gRight * (3.0f * kTanHalfFov));
    vec3 offAxisRight = normalize(cross(offAxisForward, vec3(0.0f, 0.0f, 1.0f)));
    vec3 offAxisUp = normalize(cross(offAxisRight, offAxisForward));
    Check(Luma(CelestialLensFlare(record, offAxisForward, offAxisForward, offAxisRight, offAxisUp,
                                  white, 1.0f, kTanHalfFov)) == 0.0f,
          "sun outside the reference screen gate contributes nothing", "");

    std::printf("\n========================================================================\n");
    std::printf(" %d checks, %d failures\n", gChecks, gFail);
    std::printf("========================================================================\n");
    return gFail;
}
